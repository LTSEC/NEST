package terraformer

import (
	"NESTBackendShowcase/games"
	"NESTBackendShowcase/logger"
	"NESTBackendShowcase/types"
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/hashicorp/terraform-exec/tfexec"
)

// Takes in an absolute filepath to generate a terraform main.tf file
func GenerateTerraform(filePath string) error {
	tfparser := filepath.Join("scripts", "tfparser.py")
	cmd := exec.Command("python", tfparser, "-i", filePath)
	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if stderr.Len() > 0 {
			return fmt.Errorf("%v\nParser stderr:\n%s", err, stderr.String())
		}
		return err
	}
	fmt.Println(out.String())

	return nil
}

// logEnvVarStatus logs which OpenNebula environment variables are set or missing.
// The password value is never logged, only whether it is set.
func logEnvVarStatus(logCh chan<- string) map[string]string {
	env := map[string]string{
		"OPENNEBULA_ENDPOINT": os.Getenv("OPENNEBULA_ENDPOINT"),
		"OPENNEBULA_USERNAME": os.Getenv("OPENNEBULA_USERNAME"),
		"OPENNEBULA_PASSWORD": os.Getenv("OPENNEBULA_PASSWORD"),
		"OPENNEBULA_INSECURE": os.Getenv("OPENNEBULA_INSECURE"),
	}

	var missing []string
	for key, val := range env {
		if val == "" {
			missing = append(missing, key)
		}
	}

	if len(missing) > 0 {
		logCh <- fmt.Sprintf("[WARN] The following OpenNebula environment variables are not set: %s", strings.Join(missing, ", "))
	} else {
		logCh <- fmt.Sprintf("[INFO] OpenNebula endpoint: %s", env["OPENNEBULA_ENDPOINT"])
		logCh <- fmt.Sprintf("[INFO] OpenNebula username: %s", env["OPENNEBULA_USERNAME"])
		logCh <- fmt.Sprintf("[INFO] OPENNEBULA_INSECURE: %s", env["OPENNEBULA_INSECURE"])
		logCh <- "[INFO] All required OpenNebula environment variables are set."
	}

	return env
}

// Takes in an absolute filepath and runs the terraform to create a game
func RunTerraform(filePath string, logManager *logger.LogManager, gid int) error {
	// Logger setup
	logCh := logManager.CreateChannel(gid)
	defer logManager.CloseChannel(gid)

	// Check if the game ID can be found
	_, ok := games.GlobalGameManager.Get(gid)
	if !ok {
		logCh <- fmt.Sprintf("[ERROR] Game ID %d not found in game manager", gid)
		return nil
	}

	games.GlobalGameManager.SetStatus(gid, types.StateStarting)
	logCh <- fmt.Sprintf("[INFO] Starting Terraform process for game ID %d...", gid)
	logCh <- fmt.Sprintf("[INFO] Terraform working directory: %s", filePath)

	// Validate and log OpenNebula environment variables
	env := logEnvVarStatus(logCh)

	// Terraform setup
	tform_ctx := context.Background()
	tofu, err := exec.LookPath("tofu")
	if err != nil {
		logCh <- fmt.Sprintf("[ERROR] Failed to find 'tofu' (OpenTofu) on the system PATH: %v", err)
		logCh <- "[ERROR] Please ensure OpenTofu is installed and accessible in your PATH."
		games.GlobalGameManager.SetStatus(gid, types.StateError)
		return err
	}
	logCh <- fmt.Sprintf("[INFO] Found tofu at: %s", tofu)

	tf, err := tfexec.NewTerraform(filePath, tofu)
	if err != nil {
		logCh <- fmt.Sprintf("[ERROR] Failed to create Terraform executor for path '%s': %v", filePath, err)
		games.GlobalGameManager.SetStatus(gid, types.StateError)
		return err
	}

	// Apply environment vars to Terraform execution context
	tf.SetEnv(env)

	// Set logger to grab terraform stdout and stderr
	tf.SetStdout(logger.NewLogWriter(logCh, os.Stdout, "[TF]: "))
	tf.SetStderr(logger.NewLogWriter(logCh, os.Stderr, "[TF ERR]: "))

	logCh <- "[INFO] Running terraform init..."
	if err := tf.Init(tform_ctx, tfexec.Upgrade(true)); err != nil {
		logCh <- fmt.Sprintf("[ERROR] Terraform init failed: %v", err)
		logCh <- "[ERROR] This may indicate a provider configuration issue or network connectivity problem."
		games.GlobalGameManager.SetStatus(gid, types.StateError)
		return err
	}
	logCh <- "[INFO] Terraform initialized successfully."

	logCh <- "[INFO] Running terraform apply..."
	if err := tf.Apply(tform_ctx); err != nil {
		logCh <- fmt.Sprintf("[ERROR] Terraform apply failed: %v", err)
		logCh <- "[ERROR] Check the terraform output above for specific resource creation errors."
		games.GlobalGameManager.SetStatus(gid, types.StateError)
		return err
	}

	logCh <- "[OK] Terraform applied successfully."
	games.GlobalGameManager.SetStatus(gid, types.StateRunning)

	return nil
}

// Takes in an absolute filepath and destroys the active terraform of a game
func DestroyTerraform(filePath string, logManager *logger.LogManager, gid int) error {
	// Logger setup
	logCh := logManager.CreateChannel(gid)
	defer logManager.CloseChannel(gid)

	// Check if the game ID can be found
	_, ok := games.GlobalGameManager.Get(gid)
	if !ok {
		logCh <- fmt.Sprintf("[ERROR] Game ID %d not found in game manager", gid)
		return nil
	}

	games.GlobalGameManager.SetStatus(gid, types.StateStopping)
	logCh <- fmt.Sprintf("[INFO] Starting Terraform destroy for game ID %d...", gid)
	logCh <- fmt.Sprintf("[INFO] Terraform working directory: %s", filePath)

	// Validate and log OpenNebula environment variables
	env := logEnvVarStatus(logCh)

	// Terraform setup
	tform_ctx := context.Background()
	tofu, err := exec.LookPath("tofu")
	if err != nil {
		logCh <- fmt.Sprintf("[ERROR] Failed to find 'tofu' (OpenTofu) on the system PATH: %v", err)
		logCh <- "[ERROR] Please ensure OpenTofu is installed and accessible in your PATH."
		games.GlobalGameManager.SetStatus(gid, types.StateError)
		return err
	}
	logCh <- fmt.Sprintf("[INFO] Found tofu at: %s", tofu)

	tf, err := tfexec.NewTerraform(filePath, tofu)
	if err != nil {
		logCh <- fmt.Sprintf("[ERROR] Failed to create Terraform executor for path '%s': %v", filePath, err)
		games.GlobalGameManager.SetStatus(gid, types.StateError)
		return err
	}

	// Apply environment vars to Terraform execution context
	tf.SetEnv(env)

	// Set logger to grab terraform stdout and stderr
	tf.SetStdout(logger.NewLogWriter(logCh, os.Stdout, "[TF]: "))
	tf.SetStderr(logger.NewLogWriter(logCh, os.Stderr, "[TF ERR]: "))

	logCh <- "[INFO] Running terraform init..."
	if err := tf.Init(tform_ctx, tfexec.Upgrade(true)); err != nil {
		logCh <- fmt.Sprintf("[ERROR] Terraform init failed: %v", err)
		logCh <- "[ERROR] This may indicate a provider configuration issue or network connectivity problem."
		games.GlobalGameManager.SetStatus(gid, types.StateError)
		return err
	}
	logCh <- "[INFO] Terraform initialized successfully."

	logCh <- "[INFO] Running terraform destroy..."
	if err := tf.Destroy(tform_ctx); err != nil {
		logCh <- fmt.Sprintf("[ERROR] Terraform destroy failed: %v", err)
		logCh <- "[ERROR] Check the terraform output above for specific resource errors."
		games.GlobalGameManager.SetStatus(gid, types.StateError)
		return err
	}

	logCh <- "[OK] Terraform destroyed successfully."
	games.GlobalGameManager.SetStatus(gid, types.StateStopped)

	return nil
}

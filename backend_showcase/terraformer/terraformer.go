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

	"github.com/hashicorp/terraform-exec/tfexec"
)

// Takes in an absolute filepath to generate a terraform main.tf file
func GenerateTerraform(filePath string) error {
	tfparser := filepath.Join("scripts", "tfparser.py")
	cmd := exec.Command("python", tfparser, "-i", filePath)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return err
	}
	fmt.Println(out.String())

	return nil
}

// Takes in an absolute filepath and runs the terraform to create a game
func RunTerraform(filePath string, logManager *logger.LogManager, gid int) error {
	// Logger setup
	logCh := logManager.CreateChannel(gid)
	defer logManager.CloseChannel(gid)

	// Check if the game ID can be found
	_, ok := games.GlobalGameManager.Get(gid)
	if !ok {
		logCh <- "[ERROR] Game ID not found"
		return nil
	}
	games.GlobalGameManager.SetStatus(gid, types.StateStarting)
	logCh <- "[INFO] Starting Terraform process..."

	// Terraform setup
	tform_ctx := context.Background()
	tofu, err := exec.LookPath("tofu")
	if err != nil {
		logCh <- fmt.Sprintf("[ERROR] Failed to find tofu on the system: %v", err)
		return err
	}

	tf, err := tfexec.NewTerraform(filePath, tofu)
	if err != nil {
		logCh <- fmt.Sprintf("[ERROR] Failed to create new Terraform: %v", err)
		return err
	}

	// Get relevant vars from the environment
	env := map[string]string{
		"OPENNEBULA_ENDPOINT": os.Getenv("OPENNEBULA_ENDPOINT"),
		"OPENNEBULA_USERNAME": os.Getenv("OPENNEBULA_USERNAME"),
		"OPENNEBULA_PASSWORD": os.Getenv("OPENNEBULA_PASSWORD"),
		"OPENNEBULA_INSECURE": os.Getenv("OPENNEBULA_INSECURE"),
	}

	// Apply environment vars to Terraform execution context
	tf.SetEnv(env)

	// Set logger to grab terraform stdout and stderr
	tf.SetStdout(logger.NewLogWriter(logCh, os.Stdout, "[TF]: "))
	tf.SetStderr(logger.NewLogWriter(logCh, os.Stderr, "[TF ERR]: "))

	if err := tf.Init(tform_ctx, tfexec.Upgrade(true)); err != nil {
		logCh <- fmt.Sprintf("[ERROR] Failed to initalize Terraform: %v", err)
		return err
	}

	logCh <- "[INFO] Terraform initialized."

	if err := tf.Apply(tform_ctx); err != nil {
		logCh <- fmt.Sprintf("[ERROR] Failed to apply Terraform: %v", err)
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
		logCh <- "[ERROR] Game ID not found"
		return nil
	}
	games.GlobalGameManager.SetStatus(gid, types.StateStopping)
	logCh <- "[INFO] Starting Terraform process..."

	// Terraform setup
	tform_ctx := context.Background()
	tofu, err := exec.LookPath("tofu")
	if err != nil {
		logCh <- fmt.Sprintf("[ERROR] Failed to find tofu on the system: %v", err)
		return err
	}

	tf, err := tfexec.NewTerraform(filePath, tofu)
	if err != nil {
		logCh <- fmt.Sprintf("[ERROR] Failed to create new Terraform: %v", err)
		return err
	}

	// Get relevant vars from the environment
	env := map[string]string{
		"OPENNEBULA_ENDPOINT": os.Getenv("OPENNEBULA_ENDPOINT"),
		"OPENNEBULA_USERNAME": os.Getenv("OPENNEBULA_USERNAME"),
		"OPENNEBULA_PASSWORD": os.Getenv("OPENNEBULA_PASSWORD"),
		"OPENNEBULA_INSECURE": os.Getenv("OPENNEBULA_INSECURE"),
	}

	// Apply environment vars to Terraform execution context
	tf.SetEnv(env)

	// Set logger to grab terraform stdout and stderr
	tf.SetStdout(logger.NewLogWriter(logCh, os.Stdout, "[TF]: "))
	tf.SetStderr(logger.NewLogWriter(logCh, os.Stderr, "[TF ERR]: "))

	if err := tf.Init(tform_ctx, tfexec.Upgrade(true)); err != nil {
		logCh <- fmt.Sprintf("[ERROR] Failed to initalize Terraform: %v", err)
		return err
	}

	logCh <- "[INFO] Terraform initialized."

	if err := tf.Destroy(tform_ctx); err != nil {
		logCh <- fmt.Sprintf("[ERROR] Failed to destroy Terraform: %v", err)
		return err
	}

	logCh <- "[OK] Terraform destroyed successfully."
	games.GlobalGameManager.SetStatus(gid, types.StateStopped)

	return nil
}

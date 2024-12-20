package scoring

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/xrash/smetrics"
)

var site_info []byte
var loadOnce sync.Once

// Load the HTML file into memory once
func web_startup(dir string) error {
	var err error
	loadOnce.Do(func() {
		var content []byte
		content, err = os.ReadFile(dir)
		if err == nil {
			site_info = []byte(strings.ReplaceAll(string(content), "\n", ""))
		}
	})
	return err
}

// Fetch the HTML content from a web server
func onPage(ip string, port int) ([]byte, error) {
	url := fmt.Sprintf("http://%s:%d", ip, port)
	if port == 443 {
		url = fmt.Sprintf("https://%s", ip)
	}

	// Dial server to ensure it's alive
	_, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", ip, port), 500*time.Millisecond)
	if err != nil {
		return nil, fmt.Errorf("server unreachable: %v", err)
	}

	// Fetch the page content
	res, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	return io.ReadAll(res.Body)
}

// Calculate similarity ratio between two byte slices
func similarityRatio(a, b []byte) float64 {
	return smetrics.JaroWinkler(string(a), string(b), 0.7, 4)
}

// Check if the website is up and matches expected content
func checkWeb(dir, ip string, portNum int) (bool, error) {
	if err := web_startup(dir); err != nil {
		return false, err
	}

	pageHTML, err := onPage(ip, portNum)
	if err != nil {
		return false, err
	}

	similarity := similarityRatio(site_info, pageHTML)
	return similarity >= 0.8, nil // checking if the website is atleast 80% similar
}

// Scoring logic for the web server
func ScoreWeb(dir, ip string, portNum int) (int, bool, error) {
	match, err := checkWeb(dir, ip, portNum)
	if err != nil {
		return 0, false, fmt.Errorf("web scoring failed: %v", err)
	}

	if match {
		return 1, true, nil
	}

	return 0, false, nil
}

package services

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/LTSEC/NEST/enum"
	"github.com/chromedp/chromedp"
	"github.com/xrash/smetrics"
)

var (
	webLoadOnce sync.Once
	siteInfo    []byte
)

// LoadWebFiles is a function that loads all the required web files into memory at startup
// (HTML FILES) so that they can be accessed later without inconvenience
func LoadWebFiles(dir string) error {
	var err error
	webLoadOnce.Do(func() {
		var content []byte
		content, err = os.ReadFile(dir)
		if err == nil {
			// remove newlines to normalize a bit
			siteInfo = []byte(strings.ReplaceAll(string(content), "\n", ""))
		}
	})
	return err
}

// compPageToBytes uses Chromedp to compare the bytes saved in memory and the content given by the remote server
func compPageToBytes(ip string, port int) ([]byte, error) {
	// Check if server is reachable via TCP before spinning up headless Chrome
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", ip, port), web_timeout*time.Millisecond)
	if err != nil {
		return nil, fmt.Errorf("server unreachable: %v", err)
	}
	_ = conn.Close()

	// Build the URL
	url := fmt.Sprintf("http://%s:%d", ip, port)
	if port == 443 {
		url = fmt.Sprintf("https://%s", ip)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// running as root in Docker, need no-sandbox:
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
	)

	allocCtx, _ := chromedp.NewExecAllocator(ctx, opts...)
	browserCtx, _ := chromedp.NewContext(allocCtx)

	var pageHTML string
	// Run Chromedp tasks
	err = chromedp.Run(browserCtx,
		chromedp.Navigate(url),
		// Wait for #root to appear; typical for React
		chromedp.WaitVisible("#root", chromedp.ByID),
		// Additional short delay if data loads asynchronously
		chromedp.Sleep(1*time.Second),
		// Grab the full rendered HTML
		chromedp.OuterHTML("html", &pageHTML),
	)
	if err != nil {
		return nil, fmt.Errorf("chromedp failed: %v", err)
	}

	return []byte(pageHTML), nil
}

// Calculate similarity ratio between two byte slices
func similarityRatio(a, b []byte) float64 {
	return smetrics.JaroWinkler(string(a), string(b), 0.7, 4)
}

// ScoreWeb80 ensures that a website is accessible via http, but does not
// check for the content on the website
func ScoreWeb80(service enum.Service, address string) (int, bool, error) {
	// Create an HTTP client with a timeout.
	client := &http.Client{
		Timeout: web_timeout * time.Millisecond,
	}

	// Use the HEAD method to check the URL.
	url := fmt.Sprintf("http://%s:%d", address, service.Port)
	resp, err := client.Head(url)
	if err != nil {
		return 0, false, err
	}
	// It's a good practice to close the response body even if it is empty.
	defer resp.Body.Close()

	// Check for a successful HTTP status code.
	if resp.StatusCode < 200 || resp.StatusCode > 400 {
		return 0, false, fmt.Errorf("Website returned an unexpected status code: %d", resp.StatusCode)
	}

	return service.Award, true, nil
}

// ScoreWebSSLTLS ensures that a website is accessible and is secured via SSL or TLS, but
// does not check for the content on the website
func ScoreWebSSLTLS(service enum.Service, address string) (int, bool, error) {
	// Create an HTTP client with a timeout.
	client := &http.Client{
		Timeout: web_timeout * time.Millisecond,
	}

	// Use the HEAD method to check the URL over HTTPS.
	url := fmt.Sprintf("https://%s:%d", address, service.Port)
	resp, err := client.Head(url)
	if err != nil {
		return 0, false, err
	}
	// Always close the response body.
	defer resp.Body.Close()

	// Check for a successful HTTP status code.
	if resp.StatusCode < 200 || resp.StatusCode > 400 {
		return 0, false, fmt.Errorf("Website returned an unexpected status code: %d", resp.StatusCode)
	}

	// Ensure a TLS connection was established.
	if resp.TLS == nil {
		return 0, false, fmt.Errorf("No TLS connection was established")
	}

	return service.Award, true, nil
}

// ScoreWebContent scores a website based on the content it's providing users, through either port 80 or SSL/TLS
//
// To do this, it first checks both ScoreWeb80 and ScoreWebSSLTLS to ensure the website is up before
// continuing any operations. It will return false and 0 points if both of those functions do, but
// if either function returns true it will work.
func ScoreWebContent(service enum.Service, address string) (int, bool, error) {
	// Ensure web files are loaded
	if err := LoadWebFiles(service.QFile); err != nil {
		return 0, false, err
	}

	serverInfo, err := compPageToBytes(address, service.Port)
	if err != nil {
		return 0, false, err
	}

	similarity := similarityRatio(siteInfo, serverInfo)
	if similarity < .8 {
		return 0, false, fmt.Errorf("The scored website was not similar enough to the expected content.")
	}

	return service.Award, true, nil
}

package logging

// This is for testing whenever a program unexpectedly terminates and logging needs to be done
// At any point to simulate a shutdown, press CTRL + C and it will handle accordingly

import (
	"fmt"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"testing"
	"time"
)

func TestLogDebugging(t *testing.T) {
	var (
		state       string
		mutex       sync.Mutex
		semaphore   sync.WaitGroup
		sigChannel  chan os.Signal
		exitChannel chan bool
	)

	logger := new(Logger)
	logger.StartLog()

	TeamSet := make(map[string]int)

	TeamSet["Team 1"] = 0
	TeamSet["Team 2"] = 0

	sigChannel = make(chan os.Signal, 1)
	signal.Notify(sigChannel, syscall.SIGINT, syscall.SIGTERM)

	exitChannel = make(chan bool, 1) // Channel for listening for signals or when to stop scoring (at 11 seconds)

	// simulates scoring
	go func() {
		for {
			select {
			case <-exitChannel:
				return
			default:
				time.Sleep(2 * time.Second)
				semaphore.Add(2) // Increment the semaphore for two goroutines
				go func() {
					defer semaphore.Done()
					mutex.Lock()
					defer mutex.Unlock()
					increment(logger, 2, &TeamSet, "Team 1")
				}()
				go func() {
					defer semaphore.Done()
					mutex.Lock()
					defer mutex.Unlock()
					increment(logger, 5, &TeamSet, "Team 2")
				}()
			}
		}
	}()

	// error handler.
	// child routine that listens for signals or when the program is intended to shut down
	// lets the main body know when to resume the rest of the code
	semaphore.Add(1)
	go func() {
		defer semaphore.Done()
		state = "SUCCESS"
		for {
			select {
			case sig := <-sigChannel: // handles whenever a signal is received
				state = "CRITICAL"
				switch sig {
				case syscall.SIGINT:
					logger.LogMessage("RECEIVED SIGINT (Ctrl+C)", state)
				case syscall.SIGTERM:
					logger.LogMessage("RECEIVED SIGTERM", state)
				default:
					logger.LogMessage("UNKNOWN SIGNAL", state)
				}
				exitChannel <- true
				return
			case <-time.After(11 * time.Second): // handles graceful shutdown
				exitChannel <- true
				return
			}
		}
	}()
	<-exitChannel                     // rest of code doesn't run until it gets the message to continue from above
	semaphore.Wait()                  // makes sure that all scores are registered
	shutdown(logger, &TeamSet, state) // dumps the final scores
	defer logger.StopLog()            // cleanup
}

func increment(l *Logger, points int, obj *map[string]int, key string) {
	fmt.Println(*obj)
	(*obj)[key] += points
	message := fmt.Sprintf("Added %d point to %s", points, key)
	l.LogMessage(message, "SERVER")
}

func shutdown(l *Logger, obj *map[string]int, status string) {
	var message string
	for team, score := range *obj {
		message += fmt.Sprintf("%s : %d   ", team, score)
	}
	l.LogMessage(message, status)
}

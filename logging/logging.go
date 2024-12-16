package logging

import (
	"fmt"
	"log"
	"os"
	"sync"
	"time"
)

type Logger struct {
	logFile     *os.File
	logger      *log.Logger
	once        sync.Once
	initialized bool
}

const (
	Red    = "\033[31m"
	Green  = "\033[32m"
	Yellow = "\033[33m"
	Blue   = "\033[34m"
	Reset  = "\033[0m"
)

// create logger on the Main body and pass it to any routines. ensures the constructor is only called once
// for the rest of its life time
func (l *Logger) StartLog() error {
	var err error
	l.once.Do(func() {
		err = l.initialize()
	})
	return err
}

// called in individual routines
func (l *Logger) LogMessage(msg string, status string) {
	if l.initialized {
		message := fmt.Sprintf(" %s: %s", status, msg)
		l.logger.Println(message)
	}
}

// called whenever the Main code is finished as a cleanup
func (l *Logger) StopLog() error {
	var err error
	if l.initialized {
		if l.logFile != nil {
			err := l.logFile.Close()
			if err != nil {
				fmt.Println("Failed to close log file")
			}
		}
	}
	return err
}

// serves as the constructor for the logger struct. sets the fields for what file to use and creates the logger
func (l *Logger) initialize() error {
	var err error
	filePath := getLogPath('/')
	timeAndDate := time.Now().Format("2006-01-02 15-04-05")
	fileName := fmt.Sprintf("%s%s.log", filePath, timeAndDate)
	l.logFile, err = os.Create(fileName)
	if err != nil {
		return err
	}
	l.logger = log.New(l.logFile, "", log.Ltime)
	l.initialized = true
	return nil
}

// for creating a "Logs" folder in the directory. arguments are '\\' for windows and '/' for linux
// currently it is set for Windows. if you want to change it, go to initialize and change it there.
func getLogPath(fileSeparator byte) string {
	var lastIndex int
	// gets current directory
	dirPath, err := os.Getwd()
	if err != nil {
		fmt.Println("Failed to get working directory")
		return ""
	}
	// finds the index starting from right to left to find the delimiter's index
	for i := len(dirPath) - 1; i >= 0; i-- {
		if dirPath[i] == fileSeparator {
			lastIndex = i
			break
		}
	}
	// truncates everything until that index. this gives us the base path
	dirPath = dirPath[:lastIndex+1]
	// joins "Logs" with the base path which is where we will store our Log files
	newPath := fmt.Sprintf("%sscoring-engine\\Logs", dirPath)
	fmt.Println("\n" + Green + "[LOGGER INITALIZED] " + Reset + newPath)
	// if the path doesn't exist, it creates one. may need to change the permissions later
	if _, err := os.Stat(newPath); err != nil {
		if os.IsNotExist(err) {
			os.Mkdir(newPath, 0644)
		}
	}
	// adds the delimiter ahead of the path name. this so that all we need to do is append a name to it later on
	// to create a file underneath this directory
	newPath = fmt.Sprintf("%s%c", newPath, fileSeparator)
	return newPath
}

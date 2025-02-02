package logging

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

var fileName string

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

/*
Starts logging for a specified logging instance. Automatically ensures that the constructore is only called once for its life time.
USAGE:
logger = new(logging.Logger)
logger.StartLog()
*/
func (l *Logger) StartLog() error {
	var err error
	l.once.Do(func() {
		err = l.initialize()
	})

	l.LogMessage("Logging started", "[STATUS]")
	return err
}

/*
Logs a message to the logging instance's logfile
USAGE:
logger.LogMessage(<message>, <status type>)
<message> Can be any string
<status type> Can be any string, should be in the format [ALLCAPS], examples are [ERROR] [STATUS] [INFO]
*/
func (l *Logger) LogMessage(msg string, status string) {
	if l.initialized {
		message := fmt.Sprintf(" %s: %s", status, msg)
		l.logger.Println(message)
	}
}

// Logs a message to the user's active CLI with the nest prefix [Blue]
func ConsoleLogMessage(msg string) {
	log.Printf("| %s[nest]%s > %s", Blue, Reset, msg)
}

// Logs a message to the user's active CLI with the nest prefix [Green]
func ConsoleLogSuccess(msg string) {
	log.Printf("| %s[nest]%s > %s", Green, Reset, msg)
}

// Logs an error to the user's active CLI with the nest prefix [Red]
func ConsoleLogError(msg string) {
	log.Printf("| %s[nest]%s > %s", Red, Reset, msg)
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
	fileName = fmt.Sprintf("%s%s.log", filePath, timeAndDate)
	l.logFile, err = os.Create(fileName)
	if err != nil {
		return err
	}
	l.logger = log.New(l.logFile, "", log.Ltime)
	l.initialized = true
	return nil
}

// For creating a "Logs" folder in the directory. arguments are '\\' for windows and '/' for linux
// currently it is set for Windows. if you want to change it, go to initialize and change it there.
func getLogPath(fileSeparator byte) string {
	// get current directory
	dirPath, err := filepath.Abs("./")
	if err != nil {
		fmt.Println("Failed to get working directory")
		return ""
	}
	newPath := filepath.Join(dirPath, "Logs")
	ConsoleLogSuccess(fmt.Sprintf("Logger Initalized: %s", newPath))
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

func GetFilePath() string {
	return fileName
}

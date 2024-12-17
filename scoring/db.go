package scoring

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

func DBconnect(address string, portNum int, username string, password string, DBName string) (bool, error) {
	// formats the connection string
	connStr := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s",
		username, password, address, portNum, DBName)

	// currently using mysql driver
	db, err := sql.Open("mysql", connStr)
	if err != nil {
		return false, err
	}
	defer db.Close()

	// test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return false, err
	}

	return true, nil
}

/*
func DBverify(address, string, portNum int, username string, password string, DBName string) (bool error){

}
*/

// ScoreDB uses DBConnect to check service availability and assigns points.
func ScoreDB(address string, portNum int, username string, password string, DBName string) (int, bool, error) {
	_, err := DBconnect(address, portNum, username, password, DBName)
	if err != nil {
		return 0, false, fmt.Errorf("DB scoring failed: %v", err)
	}
	return successPoints, true, nil
}

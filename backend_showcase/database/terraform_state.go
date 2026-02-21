package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// TerraformState mirrors the terraform_states table.
type TerraformState struct {
	ID            int              `json:"id"`
	GameSessionID int              `json:"gameSessionId"`
	StateData     *json.RawMessage `json:"stateData,omitempty"`
	LockID        *string          `json:"lockId,omitempty"`
	LockInfo      *json.RawMessage `json:"lockInfo,omitempty"`
	LockedAt      *time.Time       `json:"lockedAt,omitempty"`
	WorkingDir    string           `json:"workingDir"`
	CreatedAt     time.Time        `json:"createdAt"`
	UpdatedAt     time.Time        `json:"updatedAt"`
}

// CreateTerraformState registers a new terraform working directory for a session.
func CreateTerraformState(ctx context.Context, sessionID int, workingDir string) (*TerraformState, error) {
	ts := &TerraformState{}
	err := DB.QueryRowContext(ctx,
		`INSERT INTO terraform_states (game_session_id, working_dir)
		 VALUES ($1, $2)
		 RETURNING id, game_session_id, working_dir, created_at, updated_at`,
		sessionID, workingDir,
	).Scan(&ts.ID, &ts.GameSessionID, &ts.WorkingDir, &ts.CreatedAt, &ts.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create terraform state: %w", err)
	}
	return ts, nil
}

// GetTerraformStateForSession returns the terraform state for a session.
func GetTerraformStateForSession(ctx context.Context, sessionID int) (*TerraformState, error) {
	ts := &TerraformState{}
	var stateData, lockInfo []byte
	var lockID sql.NullString
	var lockedAt sql.NullTime
	err := DB.QueryRowContext(ctx,
		`SELECT id, game_session_id, state_data, lock_id, lock_info, locked_at,
		        working_dir, created_at, updated_at
		 FROM terraform_states WHERE game_session_id = $1`, sessionID,
	).Scan(
		&ts.ID, &ts.GameSessionID, &stateData, &lockID, &lockInfo, &lockedAt,
		&ts.WorkingDir, &ts.CreatedAt, &ts.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get terraform state: %w", err)
	}
	if stateData != nil {
		raw := json.RawMessage(stateData)
		ts.StateData = &raw
	}
	if lockID.Valid {
		ts.LockID = &lockID.String
	}
	if lockInfo != nil {
		raw := json.RawMessage(lockInfo)
		ts.LockInfo = &raw
	}
	if lockedAt.Valid {
		ts.LockedAt = &lockedAt.Time
	}
	return ts, nil
}

// SaveTerraformStateData persists the terraform state JSON.
func SaveTerraformStateData(ctx context.Context, sessionID int, stateData json.RawMessage) error {
	_, err := DB.ExecContext(ctx,
		`UPDATE terraform_states SET state_data = $1, updated_at = NOW()
		 WHERE game_session_id = $2`,
		stateData, sessionID,
	)
	if err != nil {
		return fmt.Errorf("save terraform state: %w", err)
	}
	return nil
}

// LockTerraformState acquires a lock on the terraform state.
func LockTerraformState(ctx context.Context, sessionID int, lockID string, lockInfo json.RawMessage) error {
	result, err := DB.ExecContext(ctx,
		`UPDATE terraform_states SET lock_id = $1, lock_info = $2, locked_at = NOW(), updated_at = NOW()
		 WHERE game_session_id = $3 AND lock_id IS NULL`,
		lockID, lockInfo, sessionID,
	)
	if err != nil {
		return fmt.Errorf("lock terraform state: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("terraform state is already locked")
	}
	return nil
}

// UnlockTerraformState releases a lock on the terraform state.
func UnlockTerraformState(ctx context.Context, sessionID int) error {
	_, err := DB.ExecContext(ctx,
		`UPDATE terraform_states SET lock_id = NULL, lock_info = NULL, locked_at = NULL, updated_at = NOW()
		 WHERE game_session_id = $1`,
		sessionID,
	)
	if err != nil {
		return fmt.Errorf("unlock terraform state: %w", err)
	}
	return nil
}

// DeleteTerraformState removes a terraform state record.
func DeleteTerraformState(ctx context.Context, sessionID int) error {
	_, err := DB.ExecContext(ctx, `DELETE FROM terraform_states WHERE game_session_id = $1`, sessionID)
	if err != nil {
		return fmt.Errorf("delete terraform state: %w", err)
	}
	return nil
}

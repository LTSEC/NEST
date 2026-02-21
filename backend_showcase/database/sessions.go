package database

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"
)

const tokenExpiryHours = 24

// GenerateToken creates a new cryptographically-random session token.
func GenerateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// CreateSession stores a new session token for the given user.
func CreateSession(ctx context.Context, userID int) (string, error) {
	token, err := GenerateToken()
	if err != nil {
		return "", err
	}

	expiresAt := time.Now().Add(tokenExpiryHours * time.Hour)
	_, err = DB.ExecContext(ctx,
		`INSERT INTO sessions (token, user_id, expires_at)
		 VALUES ($1, $2, $3)`,
		token, userID, expiresAt,
	)
	if err != nil {
		return "", fmt.Errorf("create session: %w", err)
	}
	return token, nil
}

// ValidateSession returns the associated user if the token is valid and not expired.
func ValidateSession(ctx context.Context, token string) (*User, error) {
	u := &User{}
	err := DB.QueryRowContext(ctx,
		`SELECT u.id, u.username, u.email, u.password_hash, u.role, u.created_at, u.updated_at
		 FROM sessions s
		 JOIN users u ON u.id = s.user_id
		 WHERE s.token = $1 AND s.expires_at > NOW()`,
		token,
	).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("validate session: %w", err)
	}
	return u, nil
}

// DeleteSession removes a session token (logout).
func DeleteSession(ctx context.Context, token string) error {
	_, err := DB.ExecContext(ctx, `DELETE FROM sessions WHERE token = $1`, token)
	if err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

// CleanupExpiredSessions removes all expired session tokens.
func CleanupExpiredSessions(ctx context.Context) error {
	_, err := DB.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at < NOW()`)
	if err != nil {
		return fmt.Errorf("cleanup sessions: %w", err)
	}
	return nil
}

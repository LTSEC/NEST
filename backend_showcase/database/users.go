package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// User mirrors the users table.
type User struct {
	ID           int       `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

const bcryptCost = 10

// HashPassword generates a bcrypt hash for the given password.
func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return string(hash), nil
}

// CheckPassword compares a password with a bcrypt hash.
func CheckPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// GetUserByUsername fetches a user row by username (case-insensitive).
func GetUserByUsername(ctx context.Context, username string) (*User, error) {
	u := &User{}
	err := DB.QueryRowContext(ctx,
		`SELECT id, username, email, password_hash, role, created_at, updated_at
		 FROM users WHERE LOWER(username) = LOWER($1)`, username,
	).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by username: %w", err)
	}
	return u, nil
}

// GetUserByID fetches a user by primary key.
func GetUserByID(ctx context.Context, id int) (*User, error) {
	u := &User{}
	err := DB.QueryRowContext(ctx,
		`SELECT id, username, email, password_hash, role, created_at, updated_at
		 FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return u, nil
}

// CreateUser inserts a new user with a bcrypt-hashed password.
func CreateUser(ctx context.Context, username, email, password, role string) (*User, error) {
	hash, err := HashPassword(password)
	if err != nil {
		return nil, err
	}
	u := &User{}
	err = DB.QueryRowContext(ctx,
		`INSERT INTO users (username, email, password_hash, role)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, username, email, password_hash, role, created_at, updated_at`,
		username, email, hash, role,
	).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return u, nil
}

// UpdateUsername changes a user's display name.
func UpdateUsername(ctx context.Context, userID int, newName string) (*User, error) {
	u := &User{}
	err := DB.QueryRowContext(ctx,
		`UPDATE users SET username = $1, updated_at = NOW()
		 WHERE id = $2
		 RETURNING id, username, email, password_hash, role, created_at, updated_at`,
		newName, userID,
	).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update username: %w", err)
	}
	return u, nil
}

// SeedDefaultUsers ensures the seed users exist with proper bcrypt hashes.
func SeedDefaultUsers(ctx context.Context) error {
	seeds := []struct {
		username, email, password, role string
	}{
		{"Test", "test@example.com", "Test", "user"},
		{"Developer", "dev@example.com", "Dev", "developer"},
	}

	for _, s := range seeds {
		existing, err := GetUserByUsername(ctx, s.username)
		if err != nil {
			return err
		}
		if existing != nil {
			// Re-hash if the stored hash doesn't look like bcrypt
			if len(existing.PasswordHash) < 50 || existing.PasswordHash[:4] != "$2a$" {
				hash, err := HashPassword(s.password)
				if err != nil {
					return err
				}
				_, err = DB.ExecContext(ctx,
					`UPDATE users SET password_hash = $1 WHERE id = $2`,
					hash, existing.ID,
				)
				if err != nil {
					return fmt.Errorf("rehash seed user %s: %w", s.username, err)
				}
			}
			continue
		}
		_, err = CreateUser(ctx, s.username, s.email, s.password, s.role)
		if err != nil {
			return fmt.Errorf("seed user %s: %w", s.username, err)
		}
	}
	return nil
}

// hand-rolled HS256 jwt for the admin login. only one user (me) so didn't pull a library,
// stdlib hmac does the job
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("token expired")
)

type Claims struct {
	Subject   string `json:"sub"`
	IssuedAt  int64  `json:"iat"`
	ExpiresAt int64  `json:"exp"`
}

type JWT struct {
	secret []byte
}

func New(secret []byte) *JWT {
	return &JWT{secret: secret}
}

const header = `{"alg":"HS256","typ":"JWT"}`

func (j *JWT) Issue(subject string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		Subject:   subject,
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(ttl).Unix(),
	}
	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	headerB64 := base64.RawURLEncoding.EncodeToString([]byte(header))
	claimsB64 := base64.RawURLEncoding.EncodeToString(claimsJSON)
	signingInput := headerB64 + "." + claimsB64
	sig := j.sign(signingInput)
	return signingInput + "." + sig, nil
}

func (j *JWT) Verify(token string) (Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Claims{}, ErrInvalidToken
	}
	signingInput := parts[0] + "." + parts[1]
	expectedSig := j.sign(signingInput)
	if subtle.ConstantTimeCompare([]byte(expectedSig), []byte(parts[2])) != 1 {
		return Claims{}, ErrInvalidToken
	}
	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Claims{}, ErrInvalidToken
	}
	var claims Claims
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return Claims{}, ErrInvalidToken
	}
	if time.Now().Unix() > claims.ExpiresAt {
		return Claims{}, ErrExpiredToken
	}
	return claims, nil
}

func (j *JWT) sign(signingInput string) string {
	mac := hmac.New(sha256.New, j.secret)
	mac.Write([]byte(signingInput))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

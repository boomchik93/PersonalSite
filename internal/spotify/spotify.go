// small client for spotify oauth + api, only my own account connects here
package spotify

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	authURL  = "https://accounts.spotify.com/authorize"
	tokenURL = "https://accounts.spotify.com/api/token"
	apiBase  = "https://api.spotify.com/v1"
	scopes   = "user-read-currently-playing user-read-playback-state"
)

type Client struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
	httpClient   *http.Client
}

func New(clientID, clientSecret, redirectURI string) *Client {
	return &Client{
		ClientID:     strings.TrimSpace(clientID),
		ClientSecret: strings.TrimSpace(clientSecret),
		RedirectURI:  strings.TrimSpace(redirectURI),
		httpClient:   &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *Client) Enabled() bool {
	return c.ClientID != "" && c.ClientSecret != "" && c.RedirectURI != ""
}

func (c *Client) AuthURL(state string) string {
	q := url.Values{}
	q.Set("client_id", c.ClientID)
	q.Set("response_type", "code")
	q.Set("redirect_uri", c.RedirectURI)
	q.Set("scope", scopes)
	q.Set("state", state)
	return authURL + "?" + q.Encode()
}

type Tokens struct {
	AccessToken  string
	RefreshToken string // only present on initial exchange, may be empty on refresh
	ExpiresIn    int    // seconds
}

func (c *Client) basicAuthHeader() string {
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(c.ClientID+":"+c.ClientSecret))
}

func (c *Client) Exchange(ctx context.Context, code string) (Tokens, error) {
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", c.RedirectURI)
	return c.requestToken(ctx, form)
}

func (c *Client) Refresh(ctx context.Context, refreshToken string) (Tokens, error) {
	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)
	return c.requestToken(ctx, form)
}

func (c *Client) requestToken(ctx context.Context, form url.Values) (Tokens, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return Tokens{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Authorization", c.basicAuthHeader())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return Tokens{}, err
	}
	defer resp.Body.Close()

	var body struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		Error        string `json:"error"`
		ErrorDesc    string `json:"error_description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return Tokens{}, err
	}
	if resp.StatusCode != http.StatusOK {
		if body.Error != "" {
			return Tokens{}, fmt.Errorf("spotify token error: %s (%s)", body.Error, body.ErrorDesc)
		}
		return Tokens{}, fmt.Errorf("spotify token error: unexpected status %s", resp.Status)
	}
	return Tokens{AccessToken: body.AccessToken, RefreshToken: body.RefreshToken, ExpiresIn: body.ExpiresIn}, nil
}

// ---------- Web API ----------

type NowPlaying struct {
	IsPlaying  bool
	TrackName  string
	ArtistName string
	AlbumName  string
	ImageURL   string
	TrackURL   string
	ProgressMs int
	DurationMs int
}

func (c *Client) CurrentlyPlaying(ctx context.Context, accessToken string) (NowPlaying, error) {
	req, err := c.newAPIRequest(ctx, http.MethodGet, "/me/player/currently-playing", accessToken)
	if err != nil {
		return NowPlaying{}, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return NowPlaying{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNoContent {
		return NowPlaying{}, nil // nothing playing right now, not an error
	}
	if resp.StatusCode != http.StatusOK {
		return NowPlaying{}, fmt.Errorf("spotify currently-playing: unexpected status %s", resp.Status)
	}

	var body struct {
		IsPlaying  bool `json:"is_playing"`
		ProgressMs int  `json:"progress_ms"`
		Item       *struct {
			Name       string `json:"name"`
			DurationMs int    `json:"duration_ms"`
			Album      struct {
				Name   string `json:"name"`
				Images []struct {
					URL string `json:"url"`
				} `json:"images"`
			} `json:"album"`
			Artists []struct {
				Name string `json:"name"`
			} `json:"artists"`
			ExternalURLs struct {
				Spotify string `json:"spotify"`
			} `json:"external_urls"`
		} `json:"item"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return NowPlaying{}, err
	}
	if body.Item == nil {
		return NowPlaying{IsPlaying: body.IsPlaying}, nil
	}

	artists := make([]string, 0, len(body.Item.Artists))
	for _, a := range body.Item.Artists {
		artists = append(artists, a.Name)
	}
	image := ""
	if len(body.Item.Album.Images) > 0 {
		image = body.Item.Album.Images[0].URL
	}
	return NowPlaying{
		IsPlaying:  body.IsPlaying,
		TrackName:  body.Item.Name,
		ArtistName: strings.Join(artists, ", "),
		AlbumName:  body.Item.Album.Name,
		ImageURL:   image,
		TrackURL:   body.Item.ExternalURLs.Spotify,
		ProgressMs: body.ProgressMs,
		DurationMs: body.Item.DurationMs,
	}, nil
}

func (c *Client) newAPIRequest(ctx context.Context, method, path, accessToken string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, apiBase+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	return req, nil
}

func ExpiresAtRFC3339(expiresIn int) string {
	return time.Now().UTC().Add(time.Duration(expiresIn) * time.Second).Format(time.RFC3339)
}

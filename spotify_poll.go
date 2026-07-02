package main

import (
	"context"
	"log"
	"time"

	"cv-semenov/internal/spotify"
	"cv-semenov/internal/store"
)

const (
	nowPlayingInterval = 45 * time.Second
	tokenExpiryBuffer  = 60 * time.Second
)

// checks spotify every 45s in background, saves track to history if it changed
func runSpotifyPoller(ctx context.Context, st *store.Store, sp *spotify.Client) {
	if !sp.Enabled() {
		log.Printf("spotify: disabled (no client id/secret/redirect uri configured)")
		return
	}

	nowTicker := time.NewTicker(nowPlayingInterval)
	defer nowTicker.Stop()

	lastTrackKey := ""
	pollNow(ctx, st, sp, &lastTrackKey)

	for {
		select {
		case <-ctx.Done():
			return
		case <-nowTicker.C:
			pollNow(ctx, st, sp, &lastTrackKey)
		}
	}
}

// gets access token, refreshes it if expired
func accessToken(ctx context.Context, st *store.Store, sp *spotify.Client) (string, error) {
	t, err := st.GetSpotifyTokens()
	if err != nil {
		return "", err
	}
	if t.AccessToken != "" && t.ExpiresAt != "" {
		if exp, err := time.Parse(time.RFC3339, t.ExpiresAt); err == nil && time.Now().Add(tokenExpiryBuffer).Before(exp) {
			return t.AccessToken, nil
		}
	}

	tok, err := sp.Refresh(ctx, t.RefreshToken)
	if err != nil {
		_ = st.SetSpotifyError(err.Error())
		return "", err
	}
	if err := st.UpdateSpotifyAccessToken(tok.AccessToken, spotify.ExpiresAtRFC3339(tok.ExpiresIn)); err != nil {
		return "", err
	}
	if tok.RefreshToken != "" {
		_ = st.UpdateSpotifyRefreshToken(tok.RefreshToken)
	}
	return tok.AccessToken, nil
}

// lastTrackKey is passed by pointer so we remember the previous track
// between calls and don't log the same song twice in a row
func pollNow(ctx context.Context, st *store.Store, sp *spotify.Client, lastTrackKey *string) {
	if _, err := st.GetSpotifyTokens(); err != nil {
		return // not connected yet
	}
	tok, err := accessToken(ctx, st, sp)
	if err != nil {
		log.Printf("spotify: refresh token: %v", err)
		return
	}
	np, err := sp.CurrentlyPlaying(ctx, tok)
	if err != nil {
		log.Printf("spotify: currently playing: %v", err)
		_ = st.SetSpotifyError(err.Error())
		return
	}
	if err := st.SaveNowPlaying(store.SpotifyNowPlaying{
		IsPlaying:  np.IsPlaying,
		TrackName:  np.TrackName,
		ArtistName: np.ArtistName,
		AlbumName:  np.AlbumName,
		ImageURL:   np.ImageURL,
		TrackURL:   np.TrackURL,
		ProgressMs: np.ProgressMs,
		DurationMs: np.DurationMs,
	}); err != nil {
		log.Printf("spotify: save now playing: %v", err)
		return
	}
	_ = st.SetSpotifyPolled()

	if !np.IsPlaying || np.TrackName == "" {
		*lastTrackKey = ""
		return
	}
	key := np.TrackName + "\x00" + np.ArtistName
	if key == *lastTrackKey {
		return // same song as before, skip
	}
	*lastTrackKey = key
	if err := st.RecordPlay(store.HistoryPlay{
		TrackName:  np.TrackName,
		ArtistName: np.ArtistName,
		AlbumName:  np.AlbumName,
		ImageURL:   np.ImageURL,
		TrackURL:   np.TrackURL,
	}); err != nil {
		log.Printf("spotify: record play: %v", err)
	}
}

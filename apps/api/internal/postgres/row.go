package postgres

// rowScanner is implemented by pgx.Row and pgx.Rows. Keeping the minimal
// contract here lets record decoders work with both single-row and list queries.
type rowScanner interface {
	Scan(...any) error
}

# Security and trust boundary

`seed_hash` authenticates exact seed contents and supports content addressing; it is not a publisher signature. A trusted Keymaster channel or other signed protocol must provide the format context, expected hash, and claimed source size. If an attacker replaces both seed and hash, the SDK cannot detect publisher substitution.

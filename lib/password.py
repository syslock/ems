import hashlib, string, random

def encrypt( password, salt=None ):
	if not salt:
		salt = "".join( random.sample(string.ascii_uppercase \
									+ string.ascii_lowercase \
									+ string.digits, 8) )
	return salt+"|"+hashlib.sha256( (salt+password).encode("utf-8") ).hexdigest()

def check( password, encrypted_password ):
	salt, hash_value = encrypted_password.split("|")
	return encrypted_password == encrypt( password, salt )


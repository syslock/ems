import hashlib, string, random

def encrypt( password, salt=None ):
	if not salt:
		salt = "".join( random.sample(string.ascii_uppercase \
									+ string.ascii_lowercase \
									+ string.digits, 8) )
	return salt+"|"+hashlib.sha256( (salt+password).encode("utf-8") ).hexdigest()

def encrypt_phpass( password, salt ):
	""" Unterstützung für von phpBB verwendete, gekürzte Version der 
		Passwortverschlüsselung von http://www.openwall.com/phpass/ 
		mit Code von https://github.com/exavolt/python-phpass
	"""
	s_count, salt = salt[0],salt[1:]
	itoa64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
	count = itoa64.find( s_count )
	if count not in range(7,31) or len(salt)!=8:
		return ""
	count = 1 << count
	hx = hashlib.md5( (salt+password).encode("utf-8") ).digest()
	for i in range(count):
		hx = hashlib.md5( hx+(password).encode("utf-8") ).digest()
	def encode64(inp, count):
		outp = ''
		cur = 0
		while cur < count:
			value = ord(inp[cur])
			cur += 1
			outp += itoa64[value & 0x3f]
			if cur < count:
				value |= (ord(inp[cur]) << 8)
			outp += itoa64[(value >> 6) & 0x3f]
			if cur >= count:
				break
			cur += 1
			if cur < count:
				value |= (ord(inp[cur]) << 16)
			outp += itoa64[(value >> 12) & 0x3f]
			if cur >= count:
				break
			cur += 1
			outp += itoa64[(value >> 18) & 0x3f]
		return outp
	return '$P$'+s_count+salt+encode64(hx.decode("latin-1"),16)
    
def check( password, encrypted_password ):
	salt_separator = "|"
	parts = encrypted_password.split( salt_separator )
	if len(parts)==2: 
		salt, hash_value = parts
		return encrypted_password == encrypt( password, salt )
	elif encrypted_password[0:3] in ['$P$', '$H$']:
		salt = encrypted_password[3:12]
		return encrypted_password[3:] == encrypt_phpass(password, salt)[3:]

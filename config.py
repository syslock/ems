sitename = "iswi.org"

smtp_host = "mail.gmx.net"
# smtp_port = 25
smtp_tls = True
smtp_user = "syslock@gmx.de"
smtp_password = "a01091980s"

registration_from = "syslock@gmx.de"
registration_subject = "%(sitename)s - Registration confirmation"
registration_message = """Hello %(fullname)s,

to complete your registration at %(sitename)s please follow this link:
https://schwimmen-ilmenau.de/iswi-test/ems.wsgi?do=register&msid=%(msid)s

Regards,
Your %(sitename)s Team"""


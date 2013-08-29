import imp, smtplib, sqlite3
from email.mime.text import MIMEText

from lib import application
application = imp.reload( application ) # DEBUG
from lib import user
user = imp.reload( user ) # DEBUG
from modules import login
login = imp.reload( login ) # DEBUG


def process( app ):
	"""Registrierungsanfrage prüfen (Eindeutigkeit des Nutzernamens, syntaktische 
		Korrektheit der Email-Adresse, korrekte Doppelangabe und kryptographische 
		Mindestanforderung des Passwortes) und ggf. vorläufiges Nutzerobjekt anlegen
		und Bestätigungsanfrage im E-Mail-Ausgang speichern, die einen Link auf 
		dieses Modul mit einer zusätzlichen E-Mail-Session-ID (msid) 
		enthält. Die msid wurde zuvor, genau wie der eindeutige Schlüssel des
		vorläufigen Nutzerobjektes, serverseitig im Session-Parametersatz von sid 
		hinterlegt. Die Freischaltung der Registrierung sollte nur erfolgen, wenn 
		dieses Modul über den Bestätigungslink aufgerufen wurde (msid vorhanden) und 
		URL-msid sowie serverseitig hinterlegte Session-msid übereinstimmen. Falls 
		der msid-Vergleich fehlschlägt könnte dem Nutzer angeboten werden die 
		E-Mail-Verifizierung via Knopfdruck mit neuer msid zu wiederholen, da es
		sein kann, dass die ursprüngliche Registrierung versehentlich in einem 
		anderen Browser erfolgte, als der spätere Abruf des E-Mail-Links 
		(Standardbrowser). Hierzu müsste msid als reguläre Session-Kopie von sid
		angelegt worden und genau wie sid mit dem vorläufigen Nutzerobjekt
		verknüpft worden sein, um als gültige Fallback-Session fungieren zu können. 
		Alternativ könnnte man einfach sid und msid in den E-Mail-Link aufnehmen.
		Beide Fehlertoleranz-Ansätze sind verwundbar für Lauschangriffe auf den
		E-Mail-Kanal."""
	query = app.query
	response = app.response
	session = app.session
	if "msid" in query.parms:
		confirmation_session = application.Session( app, query.parms["msid"] )
		if "registration_sid" in confirmation_session.parms \
		and confirmation_session.parms["registration_sid"] == session.sid \
		and "registration_user_id" in confirmation_session.parms:
			user_id = int( confirmation_session.parms["registration_user_id"] )
			usr = user.User( app=app, user_id=user_id )
			# Nutzer Lese-/Schreib-Zugriff auf sein eigenes Nutzerobjekt geben:
			usr.grant_read( user_id )
			usr.grant_write( user_id )
			confirmation_session.parms=[]
			confirmation_session.store()
			response.output = str( {"succeeded" : True} )
			return
		else:
			raise Exception( "Registration confirmation failed" )
	elif "nick" in query.parms and "password" in query.parms \
	and "email" in query.parms:
		nick = query.parms["nick"]
		password = query.parms["password"]
		email = query.parms["email"]
		if "reconfirm" in query.parms:
			# Bei gültigen Login-Daten (keine Ausnahme in check_login),
			# Neuauslösung der Email-Bestätigung an eine ggf. geänderte 
			# Adresse erlauben:
			usr = login.check_login( app )
			usr.update( email=email )
			send_confirmation_request( app=app, user_id=usr.id )
			response.output = str( {"succeeded" : True} )
			return
		else:
			app_old_user = app.user
			app.user = user.get_admin_user(app)
			usr = user.User( app=app, parent_id=1, nick=nick, plain_password=password,
									email=email )
			app.user = app_old_user
			# FIXME: Falls das Versenden der E-Mail hier sofort fehlschlägt,
			# müssen wir user.create entweder zurückrollen oder den 
			# fehlgeschlagenen Zustellungsversuch zwischenspeichern, sodass
			# er vom Administrator oder einem Cronjob später nochmal ausgelöst
			# werden kann:
			send_confirmation_request( app=app, user_id=usr.id )
			response.output = str( {"succeeded" : True} )
			return
	else:
		raise Exception( "Missing parameters" )

def send_confirmation_request( app, user_id ):
	c = app.db.cursor()
	c.execute( """select nick, email from users where object_id=?""",
				[user_id] )
	result = c.fetchone()
	if not result:
		raise Exception( "Invalid user_id" )
	nick, email = result
	session = app.session
	config = app.config
	confirmation_session = application.Session( app )
	confirmation_session.parms["registration_sid"] = session.sid
	confirmation_session.parms["registration_user_id"] = user_id
	confirmation_session.store()
	if hasattr( config, "smtp_host" ):
		server = None
		if hasattr( config, "smtp_port" ):
			server = smtplib.SMTP( config.smtp_host, config.smtp_port )
		else:
			server = smtplib.SMTP( config.smtp_host )
		if hasattr(config, "smtp_tls") and config.smtp_tls:
			server.starttls()
		confirmation_link = ""
		msg_vars = { "nick" : nick, "msid" : confirmation_session.sid }
		msg_vars.update( vars(config) )
		msg = MIMEText( config.registration_message % msg_vars )
		msg.set_charset("utf-8")
		msg["Subject"] = config.registration_subject % vars(config)
		email_from = config.registration_from % vars(config)
		msg["From"] = email_from
		msg["To"] = email
		if hasattr(config, "smtp_user") and hasattr(config, "smtp_password"):
			server.login( config.smtp_user, config.smtp_password )
		server.sendmail( email_from, [email], msg.as_string() )
	else:
		raise Exception( "smtp_host not configured" )


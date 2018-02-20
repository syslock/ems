import imp, smtplib, sqlite3, json, traceback
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
		#if "registration_sid" in confirmation_session.parms \
		#and confirmation_session.parms["registration_sid"] == session.sid \
		if "registration_user_id" in confirmation_session.parms:
			user_id = int( confirmation_session.parms["registration_user_id"] )
			usr = user.User( app=app, user_id=user_id )
			# Nutzer Lese-/Schreib-Zugriff auf sein eigenes Nutzerobjekt geben:
			usr.grant_read( user_id )
			usr.grant_write( user_id )
			confirmation_session.parms=[]
			confirmation_session.store()
			response.output = json.dumps( {"succeeded" : True} )
			try:
				send_registration_notification( app=app, usr=usr )
			except Exception as e:
				for line in traceback.format_exception( Exception, e, e.__traceback__ ):
					app.log( line )
			return
		else:
			try:
				send_registration_failed_notification( app=app, confirmation_session=confirmation_session )
			except Exception as e:
				for line in traceback.format_exception( Exception, e, e.__traceback__ ):
					app.log( line )
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
			app_old_user = app.user
			app.user = user.get_admin_user(app)
			usr.update( email=email )
			app.user = app_old_user
			send_confirmation_request( app=app, user_id=usr.id )
			response.output = json.dumps( {"succeeded" : True} )
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
			response.output = json.dumps( {"succeeded" : True} )
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
		msg["Subject"] = config.site_email_subject_prefix % vars(config) + _("Registration confirmation")
		site_email_address = config.site_email_address % vars(config)
		msg["From"] = site_email_address
		msg["To"] = email
		if hasattr(config, "smtp_user") and hasattr(config, "smtp_password"):
			server.login( config.smtp_user, config.smtp_password )
		server.sendmail( site_email_address, [email], msg.as_string() )
	else:
		raise Exception( "smtp_host not configured" )

def send_registration_notification( app, usr ):
	session = app.session
	config = app.config
	if hasattr( config, "smtp_host" ):
		server = None
		if hasattr( config, "smtp_port" ):
			server = smtplib.SMTP( config.smtp_host, config.smtp_port )
		else:
			server = smtplib.SMTP( config.smtp_host )
		if hasattr(config, "smtp_tls") and config.smtp_tls:
			server.starttls()
		msg_tpl = _("The new user %(nick)s registered successfully for %(sitename)s. Please assign the required access groups to her/him.")
		msg_vars = usr.status()["login"]
		msg_vars.update( vars(config) )
		msg = MIMEText( msg_tpl % msg_vars )
		msg.set_charset("utf-8")
		msg["Subject"] = config.site_email_subject_prefix % vars(config) + _("Registration notification")
		site_email_address = config.site_email_address % vars(config)
		msg["From"] = site_email_address
		msg["To"] = site_email_address
		if hasattr(config, "smtp_user") and hasattr(config, "smtp_password"):
			server.login( config.smtp_user, config.smtp_password )
		server.sendmail( site_email_address, [site_email_address], msg.as_string() )

def send_registration_failed_notification( app, confirmation_session ):
	session = app.session
	config = app.config
	query = app.query
	usr = None
	if "registration_user_id" in confirmation_session.parms:
		user_id = int( confirmation_session.parms["registration_user_id"] )
		usr = user.User( app=app, user_id=user_id )
	if hasattr( config, "smtp_host" ):
		server = None
		if hasattr( config, "smtp_port" ):
			server = smtplib.SMTP( config.smtp_host, config.smtp_port )
		else:
			server = smtplib.SMTP( config.smtp_host )
		if hasattr(config, "smtp_tls") and config.smtp_tls:
			server.starttls()
		msg_tpl = _("A registration confirmation for %(sitename)s failed.")
		msg_vars = {}
		if usr:
			msg_tpl += _("\nThe registration session corresponds to user %(nick)s with email %(email)s.")
			msg_vars.update( usr.status()["login"] )
			msg_tpl += _("\nMost likely the registration confirmation link was used by the user trying to register, but accidentally opened in different browser (session) or cookies where disabled." )
		else:
			msg_tpl += _("\nThe registration session corresponds to no user.")
			msg_tpl += _("\nMost likely an outdated registration confirmation link was used by the user trying to register.")
		msg_tpl += _("\nLess likely someone else tried to steal the users account." )
		msg_vars.update( vars(config) )
		msg_tpl = msg_tpl % msg_vars
		msg_tpl += _("\n\nquery.parms: ")+str(query.parms)
		msg_tpl += _("\nconfirmation_session.parms: ")+str(confirmation_session.parms)
		msg_tpl += _("\nsession.parms: ")+str(session.parms)
		msg = MIMEText( msg_tpl )
		msg.set_charset("utf-8")
		msg["Subject"] = config.site_email_subject_prefix % vars(config) + _("Registration failure")
		site_email_address = config.site_email_address % vars(config)
		msg["From"] = site_email_address
		msg["To"] = site_email_address
		if hasattr(config, "smtp_user") and hasattr(config, "smtp_password"):
			server.login( config.smtp_user, config.smtp_password )
		server.sendmail( site_email_address, [site_email_address], msg.as_string() )


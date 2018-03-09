import smtplib, sqlite3, json, traceback
from email.mime.text import MIMEText

from lib import application
from lib import user
from modules import login


def process( app ):
	query = app.query
	response = app.response
	session = app.session
	if "msid" in query.parms:
		confirmation_session = application.Session( app, query.parms["msid"] )
		if "password_recovery_sid" in confirmation_session.parms \
		and "password_recovery_user_id" in confirmation_session.parms:
			user_id = int( confirmation_session.parms["password_recovery_user_id"] )
			if "nick" in query.parms and "new_password" in query.parms \
			and confirmation_session.parms["password_recovery_sid"] == session.sid:
				# Asking the user requesting password recovery for his own nick might add a thin line
				# of additional security against the registered email account being controlled by an attacker,
				# as long as the nick is not disclosed in the recovery request confirmation mail.
				usr = user.User( app=app, user_id=user_id )
				usr_status = usr.status()
				if( usr_status["login"]["nick"]!=query.parms["nick"] ):
					try:
						send_password_recovery_failed_notification( app=app, confirmation_session=confirmation_session )
					except Exception as e:
						for line in traceback.format_exception( Exception, e, e.__traceback__ ):
							app.log( line )
					raise Exception( "Password recovery failed" )
				# We have to escalate to admin privileges for the password change procedure to not require old password validation
				app_old_user = app.user
				app.user = user.get_admin_user( app )
				usr.update( new_password=query.parms["new_password"] )
				app.user = app_old_user
				# Purge confirmation session
				confirmation_session.parms=[]
				confirmation_session.store()
				response.output = json.dumps( {"succeeded" : True} )
				try:
					send_password_recovery_notification( app=app, usr=usr )
				except Exception as e:
					for line in traceback.format_exception( Exception, e, e.__traceback__ ):
						app.log( line )
				return
			elif "cancel" in query.parms \
			and user_id == app.user.id:
				# Purge confirmation session
				confirmation_session.parms=[]
				confirmation_session.store()
				response.output = json.dumps( {"succeeded" : True} )
				try:
					send_password_recovery_cancel_notification( app=app, usr=usr )
				except Exception as e:
					for line in traceback.format_exception( Exception, e, e.__traceback__ ):
						app.log( line )
				return
			else:
				try:
					send_password_recovery_failed_notification( app=app, confirmation_session=confirmation_session )
				except Exception as e:
					for line in traceback.format_exception( Exception, e, e.__traceback__ ):
						app.log( line )
				raise Exception( "Password recovery failed" )
		else:
			try:
				send_password_recovery_failed_notification( app=app, confirmation_session=confirmation_session )
			except Exception as e:
				for line in traceback.format_exception( Exception, e, e.__traceback__ ):
					app.log( line )
			raise Exception( "Password recovery failed" )
	elif "nick" in query.parms and "email" in query.parms:
		nick = query.parms["nick"]
		email = query.parms["email"]
		c = app.db.cursor()
		c.execute(
			"""select object_id from users where nick=? and email=?""",
			[nick, email] )
		result = c.fetchone()
		if result==None:
			raise Exception( "Invalid user name or email address" )
		else:
			user_id = int( result[0] )
			app_old_user = app.user
			app.user = user.get_admin_user( app )
			usr = user.User( app, user_id=user_id )
			app.user = app_old_user
			send_confirmation_request( app=app, user_id=usr.id )
			response.output = json.dumps( {"succeeded" : True} )
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
	confirmation_session.parms["password_recovery_sid"] = session.sid
	confirmation_session.parms["password_recovery_user_id"] = user_id
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
		# We do not allow the requesting users nick to be included in the confirmation mail
		# as the registered email might be controlled by an attacker and would then contain
		# all required information for identity theft.
		msg_vars = { "msid" : confirmation_session.sid }
		msg_vars.update( vars(config) )
		msg = MIMEText( config.password_recovery_message % msg_vars )
		msg.set_charset("utf-8")
		msg["Subject"] = config.site_email_subject_prefix % vars(config) + _("Password recovery requested")
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


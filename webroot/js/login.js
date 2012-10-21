function logout()
{
	$.get( "ems.wsgi?do=logout", function(result)
	{
		result = parse_result( result )
		init()
	})
}

function login()
{
	$.post( "ems.wsgi?do=login", 
			"&nick="+$("input.login-nick")[0].value
			+"&password="+$("input.login-password")[0].value, 
	function(result)
	{
		result = parse_result( result )
		if( result.succeeded )
		{ 
			$("input.login-password")[0].value = ""
			init() 
		}
		else
		{
			hilight_error_fields( result.error )
			if( result.error && result.error.message=="Insufficient privileges" )
			{
				show_register()
				$(".register-password")[0].style.display="none"
				$(".register-submit")[0].style.display="none"
				$(".register-reconfirm")[0].style.display=""
			}
			else
			{
				$("input.login-password")[0].value = ""
			}
		}
	})
}

function register()
{
	if( $("input.login-password")[0].value
		!= $("input.register-password")[0].value )
	{
		$("ems-error")[0].innerHTML = LS("20120513162118","Passwörter müssen übereinstimmen")
		$("input.login-password")[0].value = ""
		$("input.register-password")[0].value = ""
		return;
	}
	$.post( "ems.wsgi?do=register", 
			"&nick="+$("input.login-nick")[0].value
			+"&password="+$("input.login-password")[0].value
			+"&email="+$("input.register-email")[0].value,
	function(result)
	{
		result = parse_result( result )
		if( result.succeeded ) { init() }
		else { hilight_error_fields(result.error) }
	})
	$("input.login-password")[0].value = ""
	$("input.register-password")[0].value = ""
}

function reconfirm()
{
	$.post( "ems.wsgi?do=register", 
			"&reconfirm&nick="+$("input.login-nick")[0].value
			+"&password="+$("input.login-password")[0].value
			+"&email="+$("input.register-email")[0].value,
	function(result)
	{
		result = parse_result( result )
		if( result.succeeded ) { init() }
		else { hilight_error_fields(result.error) }
	})
	$("input.login-password")[0].value = ""
	$("input.register-password")[0].value = ""
}

function hilight_error_fields( error )
{
	if( error && (error.message == "Invalid user name or password"
				|| error.message == "Nick already in use") )
	{
		hilight( $(".login-nick")[0] )
	}
	else unlight( $(".login-nick")[0] )
	if( error && (error.message == "Invalid user name or password"
				|| error.message == "Password has to be at least 8 characters long") )
	{
		hilight( $(".login-password")[0] )
	}
	else unlight( $(".login-password")[0] )
	if( error && (error.message == "Insufficient privileges") )
	{
		hilight( $(".register-email")[0] )
	}
	else unlight( $(".register-email")[0] )
}

function hide_register()
{
	$(".ems-register")[0].style.display="none"
	$(".login-submit")[0].style.display=""
	$(".login-register")[0].style.display=""
}

function show_register()
{
	$(".ems-register")[0].style.display=""
	$(".login-submit")[0].style.display="none"
	$(".login-register")[0].style.display="none"
	$(".register-password")[0].style.display=""
	$(".register-submit")[0].style.display=""
	$(".register-reconfirm")[0].style.display="none"
}



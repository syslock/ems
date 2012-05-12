function show_login()
{
	$("title")[0].innerHTML = $(".ems-heading")[0].innerHTML = "Anmeldung"
	$(".ems-login")[0].style.display = ""
	$(".menu-logout")[0].style.display = "none"
	$(".ems-new-entry")[0].style.display = "none"
}

function logout()
{
	$.get( "ems.wsgi?do=logout", function(result)
	{
		result = parse_result( result )
		if( result.succeeded ) { init() }
	})
}

function login()
{
	$.get( "ems.wsgi?do=login&nick="+$("input.login-nick")[0].value
			+"&password="+$("input.login-password")[0].value, 
	function(result)
	{
		result = parse_result( result )
		if( result.succeeded ) { init() }
	})
	$("input.login-password")[0].value = ""
}

function register()
{
	if( $("input.login-password")[0].value
		!= $("input.register-password")[0].value )
	{
		$("ems-error")[0].innerHTML = "Passwörter müssen übereinstimmen"
		$("input.login-password")[0].value = ""
		$("input.register-password")[0].value = ""
		return;
	}
	$.get( "ems.wsgi?do=register&nick="+$("input.login-nick")[0].value
			+"&password="+$("input.login-password")[0].value
			+"&email="+$("input.register-email")[0].value
			+"&fullname="+$("input.register-fullname")[0].value,
	function(result)
	{
		result = parse_result( result )
		if( result.succeeded ) { init() }
	})
	$("input.login-password")[0].value = ""
	$("input.register-password")[0].value = ""
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
}


function logout() {
	get_module( "logout", {
		args : {},
		done : function( result ) {
			result = parse_result( result );
			if( result.succeeded ) {
				$(".ems-content").empty();
				init();
			}
		}
	});
}

function login() {
	post_module( "login", {
		data : {nick : $("input.login-nick")[0].value, password : $("input.login-password")[0].value},
		done : function( result ) {
			result = parse_result( result );
			if( result.succeeded ) { 
				$("input.login-password")[0].value = "";
				init();
			}
		},
		fail : function( result ) {
			result = parse_result( result );
			hilight_error_fields( result.error );
			if( result.error && result.error.message.match(/insufficient privileges/i) ) {
				show_register();
				$(".register-password")[0].style.display="none";
				$(".register-submit")[0].style.display="none";
				$(".register-reconfirm")[0].style.display="";
			} else {
				$("input.login-password")[0].value = "";
			}
		}
	});
}

function register() {
	if( $("input.login-password")[0].value
		!= $("input.register-password")[0].value )
	{
		show_register_password_match_message();
		$("input.login-password")[0].value = "";
		$("input.register-password")[0].value = "";
		hilight( $("input.login-password")[0] );
		hilight( $("input.register-password")[0] );
		return;
	}
	post_module( "register", {
		data : {
			nick : $("input.login-nick")[0].value,
			password : $("input.login-password")[0].value,
			email : $("input.register-email")[0].value
		},
		done : function( result ) {
			result = parse_result( result );
			if( result.succeeded )
			{
				hide_login();
				hide_register();
				show_register_submit_message();
			}
		},
		fail : function( result ) {
			result = parse_result( result );
			hilight_error_fields( result.error );
		}
	});
	$("input.login-password")[0].value = "";
	$("input.register-password")[0].value = "";
}

function reconfirm() {
	post_module( "register", {
		data : {
			reconfirm : "",
			nick : $("input.login-nick")[0].value,
			password : $("input.login-password")[0].value,
			email : $("input.register-email")[0].value
		},
		done : function( result ) {
			result = parse_result( result );
			if( result.succeeded )
			{
				hide_login();
				hide_register();
				show_register_submit_message();
			}
		},
		fail : function( result ) {
			result = parse_result( result );
			hilight_error_fields(result.error);
		}
	});
	$("input.login-password")[0].value = "";
	$("input.register-password")[0].value = "";
}

function hilight_error_fields( error ) {
	if( error && (error.message.match(/user name/i)
				|| error.message.match(/nutzername/i)
				|| error.message.match(/nick/i)) ) {
		hilight( $("input.login-nick")[0] );
	}
	else unlight( $("input.login-nick")[0] );
	if( error && (error.message.match(/password/i)
				|| error.message.match(/passwort/i)) ) {
		hilight( $("input.login-password")[0] );
	}
	else {
		unlight( $("input.login-password")[0] );
		unlight( $("input.register-password")[0] );
	}
	if( error && (error.message.match(/insufficient privileges/i)) ) {
		hilight( $("input.register-email")[0] );
	}
	else unlight( $("input.register-email")[0] );
	if( error ) show_message( error.message );
}

function hide_login() {
	$(".login-form")[0].style.display="none"
}

function show_login() {
	$(".login-form")[0].style.display=""
	$(".login-submit")[0].style.display=""
}

function hide_register() {
	$(".register-form")[0].style.display="none"
	$(".login-submit")[0].style.display=""
	$(".login-register")[0].style.display=""
}

function show_register() {
	$(".register-form")[0].style.display=""
	$(".login-submit")[0].style.display="none"
	$(".login-register")[0].style.display="none"
	$(".register-password")[0].style.display=""
	$(".register-submit")[0].style.display=""
	$(".register-reconfirm")[0].style.display="none"
}



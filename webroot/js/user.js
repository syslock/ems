function edit_password( button ) {
	var user_element = $(button).closest(".ems-user")[0];
	var user_id = user_element.data.object_id;
	if( global_user.id == user_id ) {
		// Bei Änderung des eigenen Passworts aus Sicherheitsgründen das alte abfragen:
		// (serverseitige Berechtigungsprüfung übernimmt in jedem Fall der Store-Handler)
		$('.user-old-password',user_element)[0].style.display='';
	} else {
		$('.user-old-password',user_element)[0].style.display='none';
	}
	$('.user-password-dialog',user_element)[0].style.display='';
}

function change_password( button, old_password, new_password ) {
	var user_element = $(button).closest(".ems-user")[0];
	var user_id = user_element.data.object_id;
	var old_password = $('.user-old-password-input',user_element)[0].value;
	var new_password = $('.user-new-password-input',user_element)[0].value;
	var new_password_2 = $('.user-new-password-input-2',user_element)[0].value;
	hide_status();
	unlight( $('.user-old-password-input',user_element)[0] );
	unlight( $('.user-new-password-input',user_element)[0] );
	unlight( $('.user-new-password-input-2',user_element)[0] );
	if( new_password!=new_password_2 ) {
		show_error( '${_("Das neue Passwort muss zwei mal identisch eingegeben werden!")}' );
		$('.user-new-password-input',user_element)[0].value='';
		$('.user-new-password-input-2',user_element)[0].value='';
		hilight( $('.user-new-password-input',user_element)[0] );
		hilight( $('.user-new-password-input-2',user_element)[0] );
		return;
	}
	$.ajax({
		url : "ems.wsgi?do=store&type=application/x-obj.user&id="+String(user_id),
		type : "POST",
		data : { old_password: old_password, new_password: new_password },
		async : false,
		success :
	function( result )
	{
		result = parse_result( result )
		if( result.succeeded ) {
			$('.user-old-password-input',user_element)[0].value='';
			$('.user-new-password-input',user_element)[0].value='';
			$('.user-new-password-input-2',user_element)[0].value='';
			$('.user-password-dialog',user_element)[0].style.display='none';
		} else if( result && result.error ) {
			if( result.error.message.match(/old password/i) ) {
				$('.user-old-password-input',user_element)[0].value='';
				hilight( $('.user-old-password-input',user_element)[0] );
			} else if( result.error.message.match(/password/i) ) {
				$('.user-new-password-input',user_element)[0].value='';
				$('.user-new-password-input-2',user_element)[0].value='';
				hilight( $('.user-new-password-input',user_element)[0] );
				hilight( $('.user-new-password-input-2',user_element)[0] );
			}
		}
	}})
}

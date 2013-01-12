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

function prettyprint_size( size ) {
	var value = size;
	var two_powers = 0;
	while( value>1000 ) {
		value /= 1024;
		two_powers += 10;
	}
	return String(value).match(/[0-9]*(:?\.[0-9]{0,2})?/)[0]+({10:"KiB", 20:"MiB", 30:"GiB", 40:"TiB"})[two_powers];
}

function change_user_image( button ) {
	var user_element = $(button).closest(".ems-user")[0];
	var user_id = user_element.data.object_id;
	$('.user-image-dialog',user_element)[0].style.display='';
	var preview_area = $('.user-image-preview',user_element)[0];
	$(preview_area).bind( "dragover", function(event) {
		return false;
	});
	$(preview_area).bind( "dragenter", function(event) {
		$(event.delegateTarget).addClass('user-image-preview-over');
		return false;
	});
	$(preview_area).bind( "dragleave", function(event) {
		$(event.delegateTarget).removeClass('user-image-preview-over');
		return false;
	});
	$(preview_area).bind( "drop", function(event) {
		var dt = event.originalEvent.dataTransfer;
		try {
			form_data = new FormData()
			for( var i=0; i<dt.files.length; i++ ) {
				var file = dt.files[i];
				form_data.append( "file-"+String(i), file )
			}
			$.ajax({
				url : "ems.wsgi?do=store",
				type : "POST",
				data : form_data,
				contentType: false, /*form_data den Content-Type bestimmen lassen*/
				processData: false, /*jede Zwischenverarbeitung untersagen, die Daten sind ok so...*/
				success :
			function( result ) {
				result = parse_result( result );
				if( result.succeeded ) {
					var image_id = result.object_id;
					$.ajax({
						url : "ems.wsgi?do=get&view=all&id="+String(image_id),
						success :
					function( result ) {
						result = parse_result( result );
						if( result && result.length ) {
							var meta = result[0];
							if( meta.title ) $('.user-image-title',user_element).text( meta.title );
							if( meta.type ) $('.user-image-type',user_element).text( "["+meta.type+"]" );
							if( meta.size ) $('.user-image-size',user_element).text( prettyprint_size(meta.size) );
						}
					}});
					$(preview_area).html('<img src="ems.wsgi?do=get&view=data&id='+String(image_id)+'" class="user-image-preview-content" />');
					var preview_image = $('.user-image-preview-content', preview_area)[0];
					preview_image.data = { object_id: image_id };
				}
			}});
		} catch(foo) {
			debugger;
		}
		return false;
	});
}

function close_user_image_dialog( button ) {
	var user_element = $(button).closest(".ems-user")[0];
	$('.user-image-dialog',user_element)[0].style.display='none';
}

function replace_user_image( user_element, avatar_id ) {
	$('.user-image',user_element).html('<img src="ems.wsgi?do=get&view=data&id='+String(avatar_id)+'" class="user-image-content" />');
}

function confirm_user_image( button ) {
	var user_element = $(button).closest(".ems-user")[0];
	var user_id = user_element.data.object_id;
	var preview_image = $('.user-image-preview img',user_element)[0];
	if( preview_image && preview_image.data && preview_image.data.object_id ) {
		var avatar_id = preview_image.data.object_id;
		$.ajax({
			url : "ems.wsgi",
			data : {do:'store', type:'application/x-obj.user', id:user_id, avatar_id:avatar_id},
			success :
		function( result ) {
			result = parse_result( result );
			if( result.succeeded ) {
				replace_user_image( user_element, avatar_id );
				close_user_image_dialog( button );
			}
		}});
	}
}

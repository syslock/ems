function edit_password( button ) {
	var user_element = $(button).closest(".ems-item > .ems-user")[0];
	var user_item = user_element.parentNode;
	var user_id = $(user_item).data().obj.id;
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
	var user_element = $(button).closest(".ems-item > .ems-user")[0];
	var user_item = user_element.parentNode;
	var user_id = $(user_item).data().obj.id;
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
	post_module( "store", {
		args : {type : 'application/x-obj.user', id : user_id},
		data : {old_password : old_password, new_password : new_password},
		async : false,
		done : function( result ) {
			result = parse_result( result );
			if( result.succeeded ) {
				$('.user-old-password-input',user_element)[0].value='';
				$('.user-new-password-input',user_element)[0].value='';
				$('.user-new-password-input-2',user_element)[0].value='';
				$('.user-password-dialog',user_element)[0].style.display='none';
			}
		},
		fail : function( result ) {
			result = parse_result( result );
			if( result && result.error ) {
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
		}
	});
}

function change_user_image( button ) {
	var user_element = $(button).closest(".ems-item > .ems-user")[0];
	var user_item = user_element.parentNode;
	var user_id = $(user_item).data().obj.id;
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
		$(event.delegateTarget).removeClass('user-image-preview-over');
		var dt = event.originalEvent.dataTransfer;
		try {
			form_data = new FormData()
			for( var i=0; i<dt.files.length; i++ ) {
				var file = dt.files[i];
				form_data.append( "file-"+String(i), file )
			}
			post_module( "store", {
				data : form_data,
				contentType: false, /*form_data den Content-Type bestimmen lassen*/
				processData: false, /*jede Zwischenverarbeitung untersagen, die Daten sind ok so...*/
				done : function( result ) {
					result = parse_result( result );
					if( result.succeeded ) {
						var image_id = result.id;
						get_module( "get", {
							args : {view : "all", id : image_id},
							done : function( result ) {
								result = parse_result( result );
								if( result && result.length ) {
									var meta = result[0];
									if( meta.title ) $('.user-image-title',user_element).text( meta.title );
									if( meta.type ) $('.user-image-type',user_element).text( "["+meta.type+"]" );
									if( meta.size ) $('.user-image-size',user_element).text( prettyprint_size(meta.size) );
								}
							}
						});
						$(preview_area).empty();
						var preview_image = $('<img>').attr( {
							src: get_module_url("get", {id : image_id, view : "data"}), 
							class: 'user-image-preview-content'
						} )[0];
						$(preview_area).append( preview_image );
						$(preview_image).data( {obj: {id: image_id}} );
					}
				}
			});
		} catch( error ) {
			show_message( "Beim Hochladen der Datei ist ein Fehler aufgetreten. Eventuell unterstützt dein Browser die verwendeten Schnittstellen noch nicht." );
			show_error( error );
		}
		return false;
	});
}

function close_user_image_dialog( button ) {
	var user_element = $(button).closest(".ems-user")[0];
	$('.user-image-dialog',user_element)[0].style.display='none';
}

function replace_user_image( user_element, avatar_id ) {
	var user_image = $('.user-image',user_element);
	user_image.empty();
	user_image.append( 
		$('<img>').attr({
			src: get_module_url("get", {id : avatar_id, view : "data"}), 
			class: 'user-image-content'
		})
	);
}

function confirm_user_image( button ) {
	var user_element = $(button).closest(".ems-item > .ems-user")[0];
	var user_item = user_element.parentNode;
	var user_id = $(user_item).data().obj.id;
	var preview_image = $('.user-image-preview img',user_element)[0];
	if( preview_image && $(preview_image).data().obj && $(preview_image).data().obj.id ) {
		var avatar_id = $(preview_image).data().obj.id;
		get_module( "store", {
			args : {type : 'application/x-obj.user', id : user_id, avatar_id : avatar_id},
			done : function( result ) {
				result = parse_result( result );
				if( result.succeeded ) {
					replace_user_image( user_element, avatar_id );
					close_user_image_dialog( button );
				}
			}
		});
	}
}

function show_user_details( button ) {
	var user_element = $(button).closest(".ems-item > .ems-user")[0];
	var user_item = user_element.parentNode;
	var dialog = $('.user-details-dialog',user_element)[0];
	dialog.style.display=''
	var user = $(user_item).data().obj;
	$('.user-details-nick-input',dialog).attr( {value: user.nick} );
	$('.user-details-id-input',dialog).attr( {value: user.id} );
	$('.user-details-ctime-input',dialog).attr( {value: (new Date(user.ctime*1000)).toLocaleString()} );
	$('.user-details-mtime-input',dialog).attr( {value: (new Date(user.mtime*1000)).toLocaleString()} );
	var groups = $(".user-details-groups", dialog)[0];
	var groups_content = $(".user-groups-content", groups)[0];
	get_module( "get", {
		args : {child_id : user.id, type : "application/x-obj.group", limit : 50},
		done : function( result ) {
			result = parse_result( result );
			if( !result.error ) {
				$(groups_content).empty();
				for( var i in result ) {
					var obj = result[i];
					show_object( {obj: obj, dom_parent: groups_content, duplicates: true} );
					$(obj.dom_object).addClass('user-groups-item');
					if( obj.permissions.indexOf("write")>=0 && user.permissions.indexOf("write")>=0 ) {
						$(".group-remove",obj.dom_object).show();
					}
				}
			}
		}
	});
}
function close_user_details( button ) {
	var user_element = $(button).closest(".ems-user")[0];
	$('.user-details-dialog',user_element)[0].style.display='none';
}

function show_group_selection( button ) {
	var user_element = $(button).closest(".ems-item > .ems-user")[0];
	var user_item = user_element.parentNode;
	var dialog = $('.user-details-dialog',user_element)[0];
	var groups = $(button).closest(".user-details-groups")[0];
	var groups_selection = $(".user-groups-selection", groups)[0];
	var user = $(user_item).data().obj;
	get_module( "get", {
		args : {type : "application/x-obj.group", child_id : -user.id, permissions : "write", limit : 50},
		done : function( result ) {
			result = parse_result( result );
			if( !result.error ) {
				$(groups_selection).empty();
				for( var i in result ) {
					var obj = result[i];
					show_object( {obj: obj, dom_parent: groups_selection, duplicates: true} );
					$(obj.dom_object).addClass('user-groups-selection-item');
					if( obj.permissions.indexOf("write")>=0 && user.permissions.indexOf("write")>=0 ) {
						$(".group-add",obj.dom_object).show();
					}
				}
				groups_selection.style.display = "";
				$(dialog).bind('mouseleave', function(event) {
					groups_selection.style.display = 'none';
					$(this).unbind('mouseleave');
				});
			}
		}
	});
}
function add_group( button ) {
	var user = $(button).closest(".ems-item > .ems-user")[0];
	var user_item = user.parentNode;
	var user_id = $(user_item).data().obj ? $(user_item).data().obj.id : undefined;
	var group = $(button).closest('.ems-item > .ems-group')[0];
	var group_item = group.parentNode;
	var group_id = $(group_item).data().obj.id;
	var groups_selection = $(button).closest('.user-groups-selection')[0];
	var groups_content = $('.user-groups-content',user)[0];
	get_module( "store", {
		args : {id : user_id, parent_id : group_id},
		done : function( result ) {
			result = parse_result( result );
			if( result.succeeded ) {
				groups_selection.style.display = 'none';
				// Daten neu laden, um Änderungen zu übernehmen:
				show_user_details( button )
			}
		}
	});
}
function remove_group( button ) {
	var user = $(button).closest(".ems-item > .ems-user")[0];
	var user_item = user.parentNode;
	var group = $(button).closest('.ems-item > .ems-group')[0];
	var group_item = group.parentNode;
	if( !$(user_item).data().obj || !$(user_item).data().obj.id ) {
		$(group_item).remove();
		return;
	}
	var user_id = $(user_item).data().obj.id;
	var group_id = $(group_item).data().obj.id;
	var groups_content = $(button).closest('.user-groups-content')[0];
	get_module( "delete", {
		args : {id : user_id, parent_id : group_id},
		done : function( result ) {
			result = parse_result( result );
			if( result.succeeded ) {
				// Daten neu laden, um Änderungen zu übernehmen:
				show_user_details( button )
			}
		}
	});
}

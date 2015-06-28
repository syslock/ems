var UploadDialog = function( parms ) {
	var my = this;
	my.dom_parent = parms.dom_parent;
	my.custom_class = parms.custom_class;
	my.custom_callback = parms.custom_callback;
	my.wrap = parms.wrap;
	
	my.update_progress = function( bytes_total, bytes_sent ) {
		var percentComplete = 100 * bytes_sent / bytes_total;
		var progress_string = String(Math.round(percentComplete))+"%";
		my.upload_progress.width( progress_string );
		my.upload_progress.text( progress_string );
	};
	
	my.replace_upload_preview = function( upload_id, source_obj ) {
		get_module( "get", {
			args : {view : "all", id : String(upload_id)},
			done : function( result ) {
				result = parse_result( result );
				if( result && result.length ) {
					var meta = result[0];
					if( meta.title ) $('.upload-title', my.upload_dialog).text( meta.title );
					if( meta.type ) $('.upload-type', my.upload_dialog).text( "["+meta.type+"]" );
					if( meta.size ) $('.upload-size', my.upload_dialog).text( prettyprint_size(meta.size) );
					my.preview_area.empty();
					show_object( {obj: meta, dom_parent: my.preview_area[0]} );
					if( meta.dom_object ) { 
						$(meta.dom_object).addClass('upload-object');
						$(meta.dom_object).addClass('upload-preview-content');
					}
					if( my.custom_callback ) {
						my.custom_callback( {obj: meta, source_obj: source_obj} );
					}
				}
			}
		});
	};
	
	my.upload_sync = function( files ) {
		var xhr = my.upload_dialog.data("xhr");
		if( xhr && xhr.readyState!=4 ) {
			show_error( "Vorheriger Upload nicht abgeschlossen!" );
		} else {
			var abort_upload = false;
			for( var i=0; i<files.length && !abort_upload; i++ ) {
				file = files[i];
				var chunk_size = Math.pow(2,20); // 1MiB
				var file_id = null;
				var chunks_sent = 0;
				for( var offset=0; offset<file.size && !abort_upload; offset+=chunks_sent*chunk_size ) {
					var end = offset + Math.min( chunk_size, file.size-offset );
					var chunk = file.slice( offset, end, file.type );
					var form_data = new FormData();
					form_data.append( 'chunk:'+String(offset)+':'+String(end)+':'+String(file.size), chunk, file.name );
					my.upload_status.html( $('<div>').addClass('uploading') );
					post_module( 'store', {
						args : file_id ? {id : file_id} : undefined,
						async : false,
						method : 'post',
						data : form_data,
						contentType: false, /*form_data den Content-Type bestimmen lassen*/
						processData: false, /*jede Zwischenverarbeitung untersagen, die Daten sind ok so...*/
						xhr : function() {
							var xhr = new window.XMLHttpRequest();
							xhr.upload.addEventListener( "progress", function(evt) {
								if( evt.lengthComputable ) {
									my.update_progress( file.size, offset+evt.loaded );
								}
							}, false );
							my.xhr = xhr;
							return xhr;
						},
						done : function( result ) {
							result = parse_result( result );
							if( result.succeeded && result.id ) {
								file_id = result.id;
								chunks_sent = 1;
								my.update_progress( file.size, end );
								my.upload_status.html( $('<div>').addClass('uploading') );
							} else {
								chunks_sent = 0;
								my.upload_status.html( $('<div>').addClass('recovering') );
							}
						},
						fail : function( jxhr, client_status, server_status ) {
							if( client_status=="abort" ) {
								abort_upload = true;
							} else {
								chunks_sent = 0;
								my.upload_status.html( $('<div>').addClass('recovering') );
							}
						}
					});
				}
				if( file_id && end==file.size ) {
					my.upload_status.html( $('<div>').addClass('complete') );
					my.replace_upload_preview( file_id );
				} else if ( abort_upload ) {
					my.upload_status.html( $('<div>').addClass('aborted') );
				} else {
					my.upload_status.html( $('<div>').addClass('failed') );
				}
				my.xhr = undefined;
			}
		}
	};
	
	my.choose_upload = function() {
		window.setTimeout( my.upload_sync, 0, my.upload_file_input[0].files );
	};
	
	my.close_upload_dialog = function() {
		if( my.xhr && my.xhr.status!=4 ) {
			my.xhr.abort();
		} else {
			my.upload_dialog.remove();
		}
	};
	
	my.show_recent_uploads = function() {
		if( ! my.upload_dialog.hasClass("recent-uploads-visible") ) {
			my.upload_dialog.addClass("recent-uploads-visible");
			load_visible_objects( {type: 'video/%,image/%,audio/%,application/octet-stream', permissions: ["write"], limit: 5, parent_ids: [global_user.id], dom_parent: my.upload_tools_content[0]} );
			my.upload_tools.on( "click", function(event) {
				var obj = $(event.target).closest(".entry-media").data("obj");
				if( obj && obj.id ) {
					my.replace_upload_preview( obj.id );
				}
			});
		} else {
			my.upload_dialog.removeClass("recent-uploads-visible");
		}
	};
	
	my.confirm_upload = function() {
		var upload_object = $('.upload-object', my.upload_dialog);
		my.upload_dialog.after( upload_object );
		if( upload_object.hasClass('download-link') ) {
			// fancy.css braucht wegen eines Offset-Bugs einen zusätzlichen Zeilenumbruch nach Links:
			upload_object.after( '<br>' );
		}
		upload_object[0].contentEditable = false; // verhindert Editierbarkeit des Links
		my.close_upload_dialog();
	};
	
	if( my.dom_parent ) {
		get_tpl( "elements/upload_dialog.html", { 
			done : function(result) {
				var dummy = $("<div>").html( result );
				my.upload_dialog = $( ".upload-dialog", dummy ).unwrap();
				if( parms.custom_class ) {
					my.upload_dialog.addClass( parms.custom_class );
				}
				my.upload_tools = $(".upload-tools", my.upload_dialog);
				my.upload_tools_content = $(".upload-tools-content", my.upload_tools);
				my.preview_area = $(".upload-preview", my.upload_dialog );
				my.preview_area.on( "dragover", function( event ) {
					return false;
				});
				my.preview_area.on( "dragenter", function( event ) {
					$(event.delegateTarget).addClass('upload-preview-over');
					return false;
				});
				my.preview_area.on( "dragleave", function( event ) {
					$(event.delegateTarget).removeClass('upload-preview-over');
					return false;
				});
				my.preview_area.bind( "drop", function( event ) {
					$(event.delegateTarget).removeClass('upload-preview-over');
					var dt = event.originalEvent.dataTransfer;
					if( dt.files && dt.files.length ) {
						window.setTimeout( my.upload_sync, 0, dt.files );
					}
					if( dt.mozSourceNode && $(dt.mozSourceNode).data("obj") && $(dt.mozSourceNode).data("obj").id ) {
						// Droppen eines EMS-Objektes:
						var source_id = Number( $(dt.mozSourceNode).data("obj").id );
						my.replace_upload_preview( source_id, $(dt.mozSourceNode).data("obj") );
					}
					return false;
				});
				my.upload_progress = $(".upload-progress", my.upload_dialog);
				my.upload_file_input = $( ".upload-file-input", my.upload_dialog );
				my.upload_file_input.on( "change", my.choose_upload );
				my.upload_status = $(".upload-status", my.upload_dialog);
				my.upload_save_button = $( ".upload-save", my.upload_dialog );
				my.upload_save_button.on( "click", my.confirm_upload );
				my.upload_recent_button = $( ".upload-recent", my.upload_dialog );
				my.upload_recent_button.on( "click", my.show_recent_uploads );
				my.upload_cancel_button = $( ".upload-cancel", my.upload_dialog );
				my.upload_cancel_button.on( "click", my.close_upload_dialog );
				var selection = window.getSelection();
				var range = undefined;
				try {
					range = selection.getRangeAt(0);
				} catch (error) {
					//show_error( error );
				}
				if( range && ((my.dom_parent==range.startContainer) || $(my.dom_parent).has(range.startContainer)[0]) ) {
					range.deleteContents();
					range.insertNode( my.upload_dialog[0] );
					try {
						selection.collapseToStart(); // verhindert automatische Auswahl des Dialogfeldes
					} catch (error ) {
						//show_error( error );
					}
				} else {
					var container = $(my.dom_parent).first();
					container.append( my.upload_dialog );
				}
				my.upload_dialog[0].contentEditable = false; // verhindert Editierbarkeit des Dialogfeldes
				my.upload_dialog.on( "click select", function() {
					window.getSelection().collapseToStart(); // verhindert Auswahl des Dialogfeldes
				});
				if( my.wrap ) {
					if( !my.upload_dialog[0].previousSibling || my.upload_dialog[0].previousSibling.nodeName!="BR" ) {
						my.upload_dialog.before( "<br/>" );
					}
					if( !my.upload_dialog[0].nextSibling || my.upload_dialog[0].nextSibling.nodeName!="BR" ) {
						my.upload_dialog.after( "<br/><br/>" );
					}
				}
				if( my.on_ready ) {
					my.on_ready();
				}
			}, 
			fail : function(result) {
				show_error( result )
			}
		} );
	} else {
		if( my.on_ready ) {
			my.on_ready();
		}
	}
};

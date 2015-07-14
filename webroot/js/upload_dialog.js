var UploadDialog = function( parms ) {
	var my = this;
	my.dom_parent = parms.dom_parent;
	my.custom_class = parms.custom_class;
	my.custom_callback = parms.custom_callback;
	my.wrap = parms.wrap;
	my.upload_job_list = [];
	my.chunk_size = parms.chunk_size ? parms.chunk_size : Math.pow(2,20); // 1MiB
	my.retry_limit = parms.retry_limit ? parms.retry_limit : 12; // maximum number of send retries per chunk
	my.retry_base_delay = parms.retry_base_delay ? parms.retry_base_delay : 100; // ms delay for first retry; doubled per retry per chunk
	my.abort_requested = false;
	my.pause_requested = false;
	my.accepted_types = parms.accepted_types ? parms.accepted_types : undefined; // regex pattern list
	
	my.update_progress = function( bytes_total, bytes_sent ) {
		var percentComplete = 100 * bytes_sent / bytes_total;
		var progress_string = String(Math.round(percentComplete))+"%";
		my.upload_progress.width( progress_string );
		my.upload_progress.text( progress_string );
	};
	
	my.check_accepted_types = function( type ) {
		var result = false;
		if( my.accepted_types ) {
			for( var i=0; i<my.accepted_types.length; i++ ) {
				if( type.match(my.accepted_types[i]) ) {
					result = true;
				}
			}
		} else result = true;
		if( !result ) {
			show_error( "Unerwarteter Objekttyp: "+type );
		}
		return result;
	};
	
	my.store_poster = function( parms ) {
		if( my.preview_object ) {
			var parent_obj = my.preview_object.data("obj");
			if( parent_obj && parent_obj.id && parms.obj && parms.obj.id ) {
				get_module( "store", {
					args : {id: parms.obj.id, parent_id: parent_obj.id, sequence: -1}
				} );
			}
		}
	}
	
	my.replace_upload_preview = function( upload_id, source_obj ) {
		get_module( "get", {
			args : {view : "all", id : String(upload_id)},
			done : function( result ) {
				result = parse_result( result );
				if( result && result.length ) {
					var meta = result[0];
					if( my.check_accepted_types(meta.type) ) {
						if( meta.title ) $('.upload-title', my.upload_dialog).text( meta.title );
						if( meta.type ) {
							$('.upload-type', my.upload_dialog).text( "["+meta.type+"]" );
							if( meta.type.match("^video/") ) {
								my.poster_dialog = new UploadDialog( {
									dom_parent: $('.upload-poster', my.upload_dialog)[0],
									accepted_types: ['^image/'],
									custom_class: 'poster',
									custom_callback: my.store_poster
								} );
							}
						}
						if( meta.size ) $('.upload-size', my.upload_dialog).text( prettyprint_size(meta.size) );
						my.preview_area.empty(); // FIXME: Don't remove elements being accessed by other code!
						show_object( {obj: meta, dom_parent: my.preview_area[0]} );
						if( meta.dom_object ) { 
							my.preview_object = meta.dom_object;
							$(meta.dom_object).addClass('upload-object');
							$(meta.dom_object).addClass('upload-preview-content');
						}
						if( my.custom_callback ) {
							my.custom_callback( {obj: meta, source_obj: source_obj} );
						}
					}
				}
			}
		});
	};
	
	my.upload_next_chunk = function() {
		var job = my.upload_job_list.shift();
		if( job ) {
			my.upload_pause_button.show();
			my.upload_resume_button.hide();
			var chunk = job.file.slice( job.offset, job.end, job.file.type );
			var form_data = new FormData();
			form_data.append( 'chunk:'+String(job.offset)+':'+String(job.end)+':'+String(job.file.size), chunk, job.file.name );
			my.upload_status.html( $('<div>').addClass('uploading') );
			var local_retry_or_fail = function( job ) {
				job.retry_count += 1;
				if( job.retry_count<=my.retry_limit ) {
					my.upload_job_list.unshift( job );
					my.upload_status.html( $('<div>').addClass('recovering') );
					window.setTimeout( my.upload_next_chunk, 100*Math.pow(2,job.retry_count) );
				} else {
					job.retry_count = 0;
					my.upload_job_list.unshift( job );
					my.upload_status.html( $('<div>').addClass('failed') );
					my.upload_pause_button.hide();
					my.upload_resume_button.show();
				}
			}
			post_module( 'store', {
				args : job.file_id ? {id : job.file_id} : undefined,
				method : 'post',
				data : form_data,
				contentType: false, /*form_data den Content-Type bestimmen lassen*/
				processData: false, /*jede Zwischenverarbeitung untersagen, die Daten sind ok so...*/
				xhr : function() {
					var xhr = new window.XMLHttpRequest();
					xhr.upload.addEventListener( "progress", function(evt) {
						if( evt.lengthComputable ) {
							my.update_progress( job.file.size, job.offset+evt.loaded );
						}
					}, false );
					my.xhr = xhr;
					return xhr;
				},
				done : function( result ) {
					result = parse_result( result );
					if( result.succeeded && result.id ) {
						for( var i=0; i<my.upload_job_list.length && my.upload_job_list[i].file==job.file; i++ ) {
							if( !my.upload_job_list[i].file_id ) {
								// Server-File-ID an alle übrigen Jobs für diese File antragen:
								my.upload_job_list[i].file_id = result.id;
							};
						}
						my.update_progress( job.file.size, job.end );
						if( result.id && job.end==job.file.size ) {
							my.upload_status.html( $('<div>').addClass('complete') );
							my.replace_upload_preview( result.id );
							my.upload_pause_button.hide();
							my.upload_resume_button.hide();
						} else {
							if( my.abort_requested ) {
								my.upload_job_list = [];
								my.upload_status.html( $('<div>').addClass('aborted') );
								my.upload_pause_button.hide();
								my.upload_resume_button.hide();
							} else if( my.pause_requested ) {
								my.upload_status.html( $('<div>').addClass('paused') );
								my.upload_pause_button.hide();
								my.upload_resume_button.show();
							} else {
								my.upload_status.html( $('<div>').addClass('uploading') );
								my.upload_next_chunk();
							}
						}
						my.xhr = undefined;
					} else {
						local_retry_or_fail( job );
					}
				},
				fail : function( jxhr, client_status, server_status ) {
					if( my.abort_requested ) {
						my.upload_job_list = [];
						my.upload_status.html( $('<div>').addClass('aborted') );
						my.upload_pause_button.hide();
						my.upload_resume_button.hide();
					} else if( my.pause_requested || client_status=="abort" ) {
						my.upload_job_list.unshift( job );
						my.upload_status.html( $('<div>').addClass('paused') );
						my.upload_pause_button.hide();
						my.upload_resume_button.show();
					} else {
						local_retry_or_fail( job );
					}
				}
			});
		}
	};
	
	my.upload_chunked = function( files ) {
		var xhr = my.upload_dialog.data("xhr");
		if( xhr && xhr.readyState!=4 ) {
			show_error( "Vorheriger Upload nicht abgeschlossen!" );
		} else {
			my.abort_requested = false;
			my.pause_requested = false;
			for( var i=0; i<files.length; i++ ) {
				var file = files[i];
				if( my.check_accepted_types(file.type) ) {
					for( var offset=0; offset<file.size; offset+=my.chunk_size ) {
						var end = offset + Math.min( my.chunk_size, file.size-offset );
						my.upload_job_list.push( {file: file, offset: offset, end: end, retry_count: 0} );
					}
				}
			}
			my.upload_next_chunk();
		}
	};
	
	my.choose_upload = function() {
		my.upload_chunked( my.upload_file_input[0].files );
	};
	
	my.pause_upload = function() {
		my.pause_requested = true;
		if( my.xhr && my.xhr.status!=4 ) {
			my.xhr.abort();
		}
	};
	
	my.resume_upload = function() {
		my.pause_requested = false;
		my.upload_next_chunk();
	};
	
	my.close_upload_dialog = function() {
		if( my.upload_job_list.length>0 ) {
			my.abort_requested = true;
			if( my.xhr && my.xhr.status!=4 ) {
				my.xhr.abort();
			}
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
						my.upload_chunked( dt.files );
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
				my.upload_pause_button = $( ".upload-pause", my.upload_dialog );
				my.upload_pause_button.on( "click", my.pause_upload );
				my.upload_resume_button = $( ".upload-resume", my.upload_dialog );
				my.upload_resume_button.on( "click", my.resume_upload );
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

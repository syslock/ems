var UploadDialog = function( parms ) {
	var my = this;
	my.dom_parent = parms.dom_parent;
	my.replace_content = parms.replace_content;
	my.initial_content_id = parms.initial_content_id;
	my.custom_class = parms.custom_class;
	my.custom_callback = parms.custom_callback;
	my.on_ready = parms.on_ready;
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
			if( parent_obj && parent_obj.id ) {
				var args = { id: parent_obj.id };
				if( parms.obj && parms.obj.id ) {
					args["poster_id"] = parms.obj.id;
				}
				if( parms.video_offset ) {
					args["poster_offset"] = parms.video_offset;
				}
				get_module( "convert", {
					args : args,
					done : function( result ) {
						result = parse_result( result );
						if( result.succeeded && result.substitutes ) {
							for( var i=0; i<result.substitutes.length; i++ ) {
								var substitute = result.substitutes[i];
								if( substitute.type=="poster" ) {
									$(my.preview_object).attr( {poster: get_module_url("get", {id : substitute.id, view : "data"})} );
									if( args["poster_offset"] ) {
										// Poster-Dialog aktualisieren, wenn das neue Bild nicht aus einem Upload,
										// sondern serverseitig aus einer Videopositionsvorgabe generiert wurde:
										my.poster_dialog.replace_upload_preview( substitute.substitute_id );
									}
								}
							}
						}
					}
				} );
			}
		}
	}
	
	my.set_poster_from_offset = function() {
		my.store_poster( {"video_offset" : $("video",my.preview_object)[0].currentTime} );
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
						}
						if( meta.size ) $('.upload-size', my.upload_dialog).text( prettyprint_size(meta.size) );
						my.preview_area.empty(); // FIXME: Don't remove elements being accessed by other code!
						show_object( {obj: meta, dom_parent: my.preview_area[0]} );
						if( meta.dom_object ) {
							var video = $("video",meta.dom_object)[0];
							if (video)
							{
								video.contentEditable = true; // FIXME: Firefox Workaround: https://bugzilla.mozilla.org/show_bug.cgi?id=1381620
							}
							my.preview_object = meta.dom_object;
							$(meta.dom_object).addClass('upload-object');
							$(meta.dom_object).addClass('upload-preview-content');
							if( meta.type.match("^video/") ) {
								my.poster_dialog = new UploadDialog( {
									dom_parent: $('.upload-poster', my.upload_dialog)[0],
									accepted_types: ['^image/'],
									custom_class: 'poster',
									custom_callback: my.store_poster,
									on_ready: function( poster_dialog ) {
										poster_dialog.confirm_upload = poster_dialog.close_upload_dialog;
										poster_dialog.upload_save_button.hide();
										poster_dialog.upload_cancel_button.hide();
										poster_dialog.upload_recent_button.hide();
										my.upload_poster.show();
									}
								} );
								$(my.preview_object).data( {"poster_callback" : 
									function( poster ) {
										my.poster_dialog.replace_upload_preview( poster.id );
									}
								} );
							}
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
			$(".recent-uploads-search-result").empty();
			my.upload_search_range_scroll_loader = null;
			my.upload_search = new SearchBar( {
				entry_parent : $(my.recent_uploads_searchbar),
				result_handler : function( result ) {
					var first_range = false;
					if( $(my.recent_uploads_search_result).children().length==0 ) {
						first_range = true;
						var current_search = my.upload_search.entry.text().replace(/^\s*|\s*$/g,"");
						if( current_search.length > 0 ) {
							var current_search_found = false;
							for( var i=0; i<result.hitlist.length; i++ ) {
								var obj = result.hitlist[i];
								if( obj.title && obj.title.toLowerCase()==current_search.toLowerCase() ) {
									current_search_found = true;
								}
							}
						}
					}
					result.dom_parent = my.recent_uploads_search_result;
					show_search_result( result );
					if( first_range ) {
						// Falls my.recent_uploads_search_result initial leer war, müssen wir den Scroll-Container hier
						// mit der Render-Höhe der ersten Ergebnis-Range initialiseren: 
						// Der Ergebniscontainer ist ein in der Höhe unlimitiertes DIV in einem
						// unsichtbaren Scroll-Container.
						my.upload_search.entry.outerWidth( $(my.recent_uploads_selection).innerWidth()*0.95 );
						$(my.recent_uploads_search_result).css( {position : 'relative'} );
						$(my.recent_uploads_search_result_scroll_container_hack).css( {
							'overflow-y' : 'scroll', 
							'overflow-x' : 'hidden'
						} );
						$(my.recent_uploads_search_result_scroll_container_hack).height( 400 );
						my.upload_search_range_scroll_loader.range_start = result.hitlist.length;
						my.upload_search_range_scroll_loader.scroll_handler_parms = { search_count : my.upload_search.search_count };
						my.upload_search_range_scroll_loader.start();
					}
				},
				result_types : 'file',
				empty_search : {phrase : 'user:'+global_user.nick, min_weight : "None"},
				order_by : 'mtime',
				order_reverse : 'true',
				range_limit : 5,
				new_search_handler : function( parms ) {
					$(my.recent_uploads_search_result).empty();
					$(my.recent_uploads_search_result_scroll_container_hack).show();
					if( my.upload_search_range_scroll_loader ) my.upload_search_range_scroll_loader.stop();
					my.upload_search_range_scroll_loader = new RangeScrollLoader( {
						scroll_container : my.recent_uploads_search_result_scroll_container_hack[0],
						scroll_handler : my.upload_search.search,
						scroll_condition : "element_scroll_condition"
					} );
				},
				on_ready : function() {
					my.upload_search.entry.outerWidth( $(my.recent_uploads_selection).innerWidth()*0.95 );
					my.upload_search.entry.focus();
					my.upload_search.search();
				}
			} );
			my.recent_uploads.on( "click", function(event) {
				var obj = $(event.target).closest(".ems-item").data("obj");
				if( obj && obj.id ) {
					my.upload_dialog.removeClass("recent-uploads-visible");
					my.replace_upload_preview( obj.id );
				}
			});
		} else {
			my.upload_dialog.removeClass("recent-uploads-visible");
		}
	};
	
	my.confirm_upload = function() {
		if( my.poster_dialog ) {
			my.poster_dialog.close_upload_dialog();
		}
		var upload_object = $('.upload-object', my.upload_dialog);
		my.upload_dialog.after( upload_object.detach() );
		upload_object[0].contentEditable = false; // verhindert Editierbarkeit des Links
		my.close_upload_dialog();
	};
	
	if( my.dom_parent || my.replace_content ) {
		get_tpl( "elements/upload_dialog.html", { 
			done : function(result) {
				var dummy = $("<div>").html( result );
				my.upload_dialog = $( ".upload-dialog", dummy ).unwrap();
				my.upload_dialog.data( {"upload_dialog" : my} );
				if( parms.custom_class ) {
					my.upload_dialog.addClass( parms.custom_class );
				}
				my.recent_uploads = $(".recent-uploads", my.upload_dialog);
				my.recent_uploads_close_selection_button = $(".recent-uploads-close-selection-button", my.recent_uploads);
				my.recent_uploads_close_selection_button.on( "click", my.show_recent_uploads );
				my.recent_uploads_selection = $(".recent-uploads-selection", my.recent_uploads);
				my.recent_uploads_searchbar = $(".recent-uploads-searchbar", my.recent_uploads);
				my.recent_uploads_search_result = $(".recent-uploads-search-result", my.recent_uploads);
				my.recent_uploads_search_result_scroll_container_hack = $(".recent-uploads-search-result-scroll-container-hack", my.recent_uploads);
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
				my.upload_progress = $( ".upload-progress", my.upload_dialog );
				my.upload_file_input = $( ".upload-file-input", my.upload_dialog );
				my.upload_file_input.on( "change", my.choose_upload );
				my.upload_status = $( ".upload-status", my.upload_dialog );
				my.upload_poster = $( ".upload-poster", my.upload_dialog );
				my.upload_poster_from_offset_button = $( ".upload-poster-from-offset", my.upload_dialog );
				my.upload_poster_from_offset_button.on( "click", my.set_poster_from_offset );
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
				if( my.replace_content ) {
					var obj = $(my.replace_content).data("obj");
					if( obj && obj.id ) {
						my.initial_content_id = obj.id;
					}
					$(my.replace_content).replaceWith( my.upload_dialog );
				} else if( my.dom_parent ) {
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
				}
				if( my.initial_content_id ) {
					my.replace_upload_preview( my.initial_content_id );
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
					my.on_ready( my );
				}
			}, 
			fail : function(result) {
				show_error( result )
			}
		} );
	} else {
		if( my.on_ready ) {
			my.on_ready( my );
		}
	}
};

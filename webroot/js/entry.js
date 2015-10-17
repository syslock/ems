// FIXME: module encapsulation:
var Entry = null;

define( ["jquery","item"], function($,BaseItem) {
Entry = function( parms ) {
	var my = this;
	parms = parms ? parms : {};
	parms.obj = parms.obj ? parms.obj : {};
	parms.obj.type = parms.obj.type ? parms.obj.type : "application/x-obj.entry";
	BaseItem.call( this, parms );
};
Entry.prototype = Object.create( BaseItem.prototype );
Entry.prototype.constructor = Entry;

Entry.prototype.init = function() {
	var my = this;
	if( my.template==undefined ) {
		// FIXME: We should try to do only one request for the template,
		//        even if a bunch of objects are initiated the same time,
		//        e.g. at initial page load.
		GlobalRequestQueue.add({
			module : "render",
			args : {tpl : "elements/entry.html"},
			done : function(result) {
				Entry.prototype.template = result;
				my.init();
			}, 
			fail : function(result) {
				show_error( result )
			}
		});
		GlobalRequestQueue.process();
	} else {
		BaseItem.prototype.init.call( this );
		my.entry = $( ".ems-entry", my.dom_object )[0];
		my.title = $( ".entry-title", my.entry )[0];
		my.content = $( ".entry-content", my.entry )[0];
		my.std_tools = $( ".entry-tools", my.entry )[0];
		my.std_tags = $( ".entry-tags", my.std_tools )[0];
		my.edit_tools = $( ".entry-edit-tools", my.entry )[0];
		my.edit_tags = $( ".entry-tags", my.edit_tools )[0];
		my.author = $('.entry-author', my.dom_object)[0];
		my.tags_selection = $(".entry-tags-selection", my.entry)[0];
		my.tags_searchbar = $(".entry-tags-searchbar", my.entry)[0];
		my.tags_search_result = $(".entry-tags-search-result", my.entry)[0];
		my.tags_search_result_scroll_container_hack = $(".entry-tags-search-result-scroll-container-hack", my.entry)[0];
		my.tags_content = $(".entry-tags-content", my.entry)[0];
		
		$(my.content).empty();
		$(my.author).empty();
		$(my.tags_content).empty();
		
		if( my.dom_parent ) {
			for( var i in my.obj.children ) {
				var dom_parent = my.content;
				var child = my.obj.children[i];
				if( child.type == "application/x-obj.tag" ) {
					dom_parent = my.tags_content;
				}
				show_object( {obj:my.obj.children[i], dom_parent:dom_parent, parent:my} )
			}
			var user_found = false;
			for( var i in my.obj.parents ) {
				var parent = my.obj.parents[i];
				if( parent.type == "application/x-obj.user" ) {
					user_found = true;
					show_object( {obj:parent, dom_parent:my.author, duplicates:true, parent:my} );
				}
			}
			if( !user_found ) {
				show_object( {obj:{id:3}, dom_parent:my.author, duplicates:true, parent:my} );
			}
		}
		
		my.button_show_tag_selection = $( ".entry-tags-show-selection-button", my.dom_object )[0];
		$(my.button_show_tag_selection).on( "click", function(){ my.show_tag_selection(); } );
		my.button_hide_tag_selection = $( ".entry-tags-close-selection-button", my.dom_object )[0];
		$(my.button_hide_tag_selection).on( "click", function(){ my.hide_tag_selection(); } );
		my.button_respond = $( ".entry-response-button", my.dom_object )[0];
		$(my.button_respond).on( "click", function(){ my.new_response(); } );
		my.button_link_external = $( ".entry-link-button", my.dom_object )[0];
		$(my.button_link_external).on( "click", function(){ my.link_external(); } );
		my.button_edit = $( ".entry-edit-button", my.dom_object )[0];
		$(my.button_edit).on( "click", function(){ my.edit(); } );
		my.button_delete = $( ".entry-delete-button", my.dom_object )[0];
		$(my.button_delete).on( "click", function(){ my.delete_entry(); } );
		my.button_file = $( ".entry-edit-file-button", my.dom_object )[0];
		$(my.button_file).on( "click", function() { new UploadDialog( {dom_parent: my.content, wrap: true} ); } );
		my.button_save = $( ".entry-edit-send-button", my.dom_object )[0];
		$(my.button_save).on( "click", function() { my.store(); } );
		my.button_discard = $( ".entry-edit-discard-button", my.dom_object )[0];
		$(my.button_discard).on( "click", function() { my.discard_response(); } );
	}
}

Entry.prototype.edit = function() {
	var my = this;
	$(my.entry).addClass("new-entry");
	
	if( my.title ) {
		my.title.contentEditable = true
		if( my.title.innerHTML.length==0 || !my.content ) my.title.focus()
	}
	if( my.content ) {
		my.content.contentEditable = true
		if( my.title.innerHTML.length>0 ) my.content.focus()
		
		$('.entry-media', my.content).each( function(i, element) {
			new UploadDialog( {replace_content: element} );
		});
	}
	
	// Themen des Beitrages vom Standardwerkzeug in das Bearbeitungswerkzeug verschieben:
	$(my.edit_tags).empty().append( $(my.std_tags).contents().detach() );
};

Entry.prototype.get_plain_text = function( element ) {
	var my = this;
	var current_plain_text = "";
	for( var i=0; i<element.childNodes.length; i++ ) {
		var child = element.childNodes[i];
		if( child.nodeName!="#text" ) {
			current_plain_text += my.get_plain_text( child );
			if( child.nodeName=="BR" || child.nodeName=="DIV" ) {
				current_plain_text += "\n";
			}
		}
		else current_plain_text += child.textContent;
	}
	return current_plain_text;
};

Entry.prototype.get_object_list = function( element, text_obj ) {
	var my = this;
	var current_list = [];
	if( element.nodeName=="#text" ) {
		// Text-Knoten werden mittels Regex in eine Liste von einzelnen Zeichen und HTTP(S)-URLs zerlegt
		var token_list = element.textContent.match( /https?:\/\/[^ ]+|./gim );
		token_list = token_list ? token_list : [];
		var current_plain_text = "";
		// finalize_plain_text speichert ein text/plain-Objekt mit den derzeit zwischengespeicherten, 
		// einzelnen Zeichen in der Ergebnisliste
		var finalize_plain_text = function( plain_text ) {
			var obj = { 'type': 'text/plain', 'data': plain_text };
			if( text_obj && text_obj.unassigned ) {
				obj.id = Number(text_obj.id);
				text_obj.unassigned = false;
				if( obj.data != text_obj.data ) {
					obj.changed = true;
				} else {
					obj.changed = false;
				}
			}
			if( obj.data.replace(/\s/g,'').length ) {
				// Nur nichtleere Texte übernehmen
				current_list.push( obj );
			}
		}
		for( var i=0; i<token_list.length; i++ ) {
			if( token_list[i].length==1 ) {
				// Token der Länge 1 werden als Einzelzeichen interpretiert und dem Textpuffer hinzugefügt
				current_plain_text += token_list[i];
			} else if( token_list[i].length>1 ) {
				// Token mit Länge>1 werden als HTTP(S)-Links interpretiert, wobei zunächst der aktuelle Textpuffer
				// als text/plain-Objekt und anschließend der HTTP(S)-Link als text/html-Objekt in der Ergebnisliste
				// abgelegt werden
				if( current_plain_text.length) {
					finalize_plain_text( current_plain_text );
					current_plain_text = "";
				}
				var obj = { 'type': 'text/html', 'data': $('<a>').attr({target:"_blank", href:token_list[i]}).text(token_list[i])[0].outerHTML };
				current_list.push( obj );
			}
		}
		// Zuletzt werden die abschließenden Einzelzeichen als text/plain-Objekt zusammengefasst
		if( current_plain_text.length) {
			finalize_plain_text( current_plain_text );
		}
	} else if( element.nodeName=="BR" || element.nodeName=="A" ) {
		// BR- und A-Knoten werden als HTML-Quelltext in text/html-Objekten gespeichert oder aktualisiert
		if( $(element).data().obj ) {
			if( $(element).data().obj.data != element.outerHTML ) {
				$(element).data().obj.data = element.outerHTML;
				$(element).data().obj.changed = true;
			}
			current_list.push( $(element).data().obj );
		} else {
			var obj = { 'type': 'text/html', 'data': element.outerHTML };
			current_list.push( obj );
		}
	} else if( $(element).data().obj && $(element).data().obj.type!="text/plain" ) {
		// Bei anderen Knoten mit bestehender Objekt-Attributierung, wird diese in diese
		// in die Ergebnisliste übernommen. Bestehende text/plain-Objekte werden hier
		// ignoriert, da ihr Inhalt bei der Text-Knoten-Verarbeitung erfasst wird.
		current_list.push( $(element).data().obj );
	}
	if( !$(element).data().obj || $(element).data().obj.type=="text/plain" ) {
		// Knoten ohne Objekt-Attributierung und bestehende text/plain-Objekte werden durch
		// rekursiven Aufruf verarbeitet und das Verarbeitungsergbnis der Ergebnisliste angefügt.
		// Dabei wird ein bestehende text/plain-Objekt dem rekursiven Aufruf als primäres
		// Speicherziel für den Inhalt von TEXT-Knoten mitgegeben.
		if( $(element).data().obj && $(element).data().obj.type=="text/plain" ) {
			text_obj = $(element).data().obj;
			text_obj.unassigned = true;
		}
		for( var i=0; i<element.childNodes.length; i++ ) {
			var child = element.childNodes[i];
			current_list = current_list.concat( my.get_object_list(child, text_obj) );
		}
	}
	return current_list;
};

Entry.prototype.restore_standard_tools = function() {
	var my = this;
	// Themen vom Bearbeitungswerkzeug zurück in das Standardwerkzeug verschieben:
	$(my.std_tags).empty().append( $(my.edit_tags).contents().detach() );
};

Entry.prototype.remove_new_entry_item = function() {
	var my = this;
	// neues entry-Objekt und Pseudo-Item löschen:
	$(my.dom_object).remove();
};

Entry.prototype.store = function() {
	var my = this;
	
	$(my.entry).removeClass("new-entry");
	var new_entry_created = false;
	if( !my.obj || !my.obj.id ) {
		// BaseItem.prototype.store() erledigt die eigentliche Speicherung
		new_entry_created = true;
	}
	if( my.title ) {
		my.title.contentEditable = false
		my.obj.title = my.get_plain_text( my.title )
	}
	BaseItem.prototype.store.call( my, {callback: function() {
		if( my.content ) {
			var upload_dialogs = $( ".upload-dialog", my.content );
			upload_dialogs.each( function(i, element) {
				if( element && $(element).data && $(element).data("upload_dialog") ) {
					// FIXME: Wir sollten einen generischen Weg haben die JS-Objekte in den DOM-Elementen zu referenzieren.
					$(element).data("upload_dialog").confirm_upload();
				}
			});
			var old_objrefs = $( ".objref", my.content );
			old_objrefs.each( function(i, objref) {
				if( !$(objref).data("obj") || !$(objref).data("obj").id ) {
					// Alte objref-Elemente, ohne Objektmetadaten werden unter Beibehaltung
					// ihrer Kindelemente herausgelöst...
					$(objref).children().unwrap();
				} else {
					// solche mit Objektmetadaten, umgeformt, da beim Speichern 
					// nur die aktuellen Objektmetadaten verwendet werden sollen.
					$(objref).removeClass( "objref" ).removeAttr( "oid" );
				}
			});
			// HTTP(S)-Link-Signaturen in Text-Knoten außerhalb von A-Element mit neuen A-Elementen ummanteln:
			var text_nodes = getTextNodesIn( $('.entry-content')[0] );
			for( var i in text_nodes ) {
				var text_node = text_nodes[i];
				if( $(text_node).closest('a').length==0 ) {
					$(text_node).replaceWith( $(text_node).text().replace(/(https?:\/\/[^ ]+)/gim,'<a href="$1" target="_blank">$1</a>') );
				}
			}
			my.content.contentEditable = false;
			var store_content = $(my.content).clone(true,true);
			var extract_children = function( element, data ) {
				$(element).children().each( function(i,element) {
					var obj = $(element).data("obj");
					if( obj && obj.id ) {
						if( obj.type=="text/html" || obj.type=="text/plain" ) {
							if( !data.html_obj.id && obj.type=="text/html" ) {
								// Das erste bestehende HTML-Objekt wird als Speicherplatz für den ganzen HTML-Content 
								// verwendet, bei bestehenden Beiträgen ist dies in der Regel bereits das Top-Level-Item.
								data.html_obj = obj;
							}
							$(element).data( {"obj":undefined} );
							if( obj.children && obj.children.length ) {
								data.extracted_children = data.extracted_children.concat( obj.chilren );
							}
							extract_children( element, data );
						} else {
							$(element).replaceWith( $("<div></div>").attr({'class':'objref', 'oid':String(obj.id)}) );
							data.extracted_children.push( obj );
						}
					} else {
						extract_children( element, data );
					}
				});
			};
			var content_data = { html_obj:{type:"text/html"}, extracted_children:[] };
			extract_children( store_content, content_data );
			// Standard-Tools wiederherstellen und Themen des Beitrages ermitteln:
			my.restore_standard_tools();
			if( my.tags_content ) {
				var tag_data = { html_obj:{}, extracted_children:[] };
				extract_children( my.tags_content, tag_data );
			}
			// Inhalt speichern:
			var html_obj = content_data.html_obj;
			$(".entry-html",store_content).children().unwrap();
			html_obj.data = store_content.html();
			var html_store_args = { type: html_obj.type, parent_id: String(my.obj.id), data: html_obj.data };
			if( html_obj.id ) {
				html_store_args.id = html_obj.id;
			}
			post_module( "store", {
				args : html_store_args,
				done : function(result) {
					result = parse_result(result);
					if( result.succeeded && result.id ) {
						var html_id = result.id;
						// im Beitragstext referenzierte Kindobjekte speichern:
						var content_id_list = [];
						for( var i in content_data.extracted_children ) {
							var obj = content_data.extracted_children[i];
							if( obj && obj.id ) {
								content_id_list.push( obj.id );
							}
						}
						var delete_childs_not_in = function( parent_id, child_not_in, done ) {
							post_module( "delete", {
								args : {parent_id : String(parent_id), child_not_in : child_not_in.join(",")},
								done : done
							});
						}
						if( content_id_list.length ) {
							post_module( "store", {
								args : { parent_id: String(html_id), id: content_id_list.join(",") },
								done : function(result) {
									result = parse_result(result);
									if( result.succeeded && result.id ) {
										delete_childs_not_in( html_id, content_id_list );
									}
								}
							});
						} else {
							delete_childs_not_in( html_id, [] );
						}
						// Tags (TODO: und andere dem Beitrag direkt untergeordnete Objekte) speichern und verbliebene Kindobjekte bereinigen:
						var tag_id_list = [];
						for( var i in tag_data.extracted_children ) {
							var obj = tag_data.extracted_children[i];
							if( obj && obj.id ) {
								tag_id_list.push( obj.id );
							}
						}
						if( tag_id_list.length ) {
							post_module( "store", {
								args : { parent_id: String(my.obj.id), id: tag_id_list.join(",") },
								done : function(result) {
									result = parse_result(result);
									if( result.succeeded && result.id ) {
										delete_childs_not_in( my.obj.id, [html_id].concat(tag_id_list) );
									}
								}
							});
						} else {
							delete_childs_not_in( my.obj.id, [html_id] );
						}
					}
				}
			});
		}
		if( new_entry_created ) {
			// Neuen Beitrag vorn neu anfügen:
			my.remove_new_entry_item();
			show_object( {dom_parent: my.dom_parent, obj: {id: my.obj.id}, prepend: true} );
		}
	}});
};

Entry.prototype.new_response = function() {
	var my = this;
	var user = global_user; // FIXME: should not use globals
	var new_entry = new Entry( {virtual:true, obj:{parents:[user],permissions:['read','write']}, duplicates:true, dom_parent:my.dom_parent, prepend:true} );
	$(my.dom_object).before( $(new_entry.dom_object).detach() );
	// Antworttitel aus Titel des Referenzbeitrages generieren:
	var reference_title = $(my.title).text();
	if( !reference_title.match(/^Re:/i) ) {
		reference_title = "Re: "+reference_title;
	}
	$(new_entry.title).text( reference_title );
	// Themen des Referenzbeitrages kopieren:
	$(new_entry.tags_content).empty().append( $(my.tags_content).contents().clone(true,true) );
	var entry_author = $( ".entry-author", new_entry )[0];
	new_entry.edit();
};

Entry.prototype.delete_entry = function() {
	var my = this;
	Confirm.confirm( {message: 'Diesen Eintrag wirklich löschen?', before: $(my.std_tools).first(),
		ok_callback: function( parms ) {
			get_module( "delete", {
				args : {id : String(my.obj.id)},
				done : function( result ) {
					result = parse_result( result );
					if( result.succeeded ) {
						my.remove_new_entry_item();
					}
				}
			});
		}
	});
};

Entry.prototype.discard_response = function() {
	var my = this;
	$(my.entry).removeClass("new-entry");
	if( !my.obj || !my.obj.id ) {
		my.remove_new_entry_item();
	} else {
		my.restore_standard_tools();
		if( my.title ) {
			$(my.title).empty()
			my.title.contentEditable = false;
		}
		if( my.content ) {
			$(my.content).empty()
			my.content.contentEditable = false;
		}
		$(".entry-tags-content", my.entry).empty()
		// Daten neu laden, um lokale Änderungen zu beseitigen:
		show_object( {dom_parent: my.entry, obj: my.obj, update: true} );
	}
};

Entry.prototype.show_tag_selection = function() {
	var my = this;
	$(my.button_show_tag_selection).hide();
	
	// Suchtool für Tags initialisieren:
	var range_scroll_loader = null;
	var tag_search = new SearchBar( {
		entry_parent : $(my.tags_searchbar),
		result_handler : function( result ) {
			var first_range = false;
			if( $(my.tags_search_result).children().length==0 ) {
				first_range = true;
				var current_search = tag_search.entry.text().replace(/^\s*|\s*$/g,"");
				if( current_search.length > 0 ) {
					var current_search_found = false;
					for( var i=0; i<result.hitlist.length; i++ ) {
						var obj = result.hitlist[i];
						if( obj.title && obj.title.toLowerCase()==current_search.toLowerCase() ) {
							current_search_found = true;
						}
					}
					if( !current_search_found ) {
						new EntryTag( {
							obj : {
								type : 'application/x-obj.tag', 
								title : current_search,
								permissions : ["read","write"]
							},
							dom_parent : my.tags_search_result,
							custom_class : 'entry-tag-new',
							parent: my,
							virtual: true
						} );
					}
				}
			}
			result.dom_parent = my.tags_search_result;
			result.parent = my;
			show_search_result( result );
			if( first_range ) {
				// Falls tags_search_result initial leer war, müssen wir den Scroll-Container hier
				// mit der Render-Höhe der ersten Ergebnis-Range initialiseren: 
				// HACK: Der Ergebniscontainer ist ein in der Höhe unlimitiertes DIV in einem
				//   unsichtbaren Scroll-Container, der breit genug ist, um seitlich überlappende
				//   Zusatzwerkzeuge beinhalten zu können. Diese würden sonst beschnitten, da
				//   CSS derzeit nicht erlaubt overflow-y: scroll und overflow-X: visible zu
				//   kombinieren. Letzterer Wert wird zu auto (hidden oder scroll) geändert.
				$(my.tags_search_result).width( $(my.tags_search_result).width() );
				$(my.tags_search_result).css( {position : 'relative', left : '300px'} );
				$(my.tags_search_result_scroll_container_hack).css( {
					'overflow-y' : 'scroll', 
					'overflow-x' : 'hidden', 
					'margin-left' : '-300px',
					'margin-right' : '-20px'
				} );
				$(my.tags_search_result_scroll_container_hack).height( Math.max(100,$(my.tags_search_result).height()*0.9) );
				range_scroll_loader.range_start = result.hitlist.length;
				range_scroll_loader.scroll_handler_parms = { search_count : tag_search.search_count };
				range_scroll_loader.start();
			}
		},
		result_types : 'application/x-obj.tag',
		empty_search : {phrase : 'type:tag', min_weight : "None"},
		order_by : 'mtime',
		order_reverse : 'true',
		range_limit : 10,
		new_search_handler : function( parms ) {
			$(my.tags_search_result).empty();
			$(my.tags_search_result_scroll_container_hack).show();
			if( range_scroll_loader ) range_scroll_loader.stop();
			range_scroll_loader = new RangeScrollLoader( {
				scroll_container : my.tags_search_result_scroll_container_hack,
				scroll_handler : tag_search.search,
				scroll_condition : "element_scroll_condition"
			} );
		},
		on_ready : function() {
			$(my.tags_selection).show();
			tag_search.entry.outerWidth( $(my.tags_selection).innerWidth()*0.95 );
			tag_search.entry.focus();
			tag_search.search();
		}
	} );
};

Entry.prototype.hide_tag_selection = function() {
	var my = this;
	$(my.button_show_tag_selection).show();
	$(my.tags_selection).hide();
	$(my.tags_search_result_scroll_container_hack).hide();
	$(my.tags_search_result).empty();
};

Entry.prototype.link_external = function( recursive ) {
	var my = this;
	if( my.obj && my.obj.id ) {
		get_module( "get", {
			args : {type : 'application/x-obj.publication', parent_id : my.obj.id},
			done : function( result ) {
				result = parse_result( result );
				if( result.length ) {
					var pub = result[0];
					show_object( {parent: my, obj: pub, update: true} );
					$( ".entry-publication-link", my.entry ).wrap( $("<div>").addClass("highlight") );
				} else if( !recursive ) {
					get_module( "store", {
						args : {type : 'application/x-obj.publication', parent_id : my.obj.id},
						done : function( result ) {
							result = parse_result( result );
							if( result.succeeded ) {
								my.link_external( /*recursive=*/true );
							}
						}
					});
				} else {
					show_message( "Externer Link konnte nicht erstellt werden" );
				}
			}
		});
	} else {
		show_message( "Bitte speichere den Beitrag bevor du einen Link erstellst" );
	}
};
return Entry;
}); //define()

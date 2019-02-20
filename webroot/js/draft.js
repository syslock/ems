// FIXME: module encapsulation:
var Draft = null;

define( ["jquery","entry","link-tool","emoji_selector"], function($,Entry,LinkTool,EmojiSelector) {
	Draft = function( parms ) {
		var my = this;
		parms = parms ? parms : {};
		parms.obj = parms.obj ? parms.obj : {};
		parms.obj.type = parms.obj.type ? parms.obj.type : "application/x-obj.draft";
		parms.custom_class = parms.custom_class ? parms.custom_class : "draft";
		Entry.call( this, parms );
	};
	Draft.prototype = Object.create( Entry.prototype );
	Draft.prototype.constructor = Draft;
	
	// Return "entry" as short_type, because Draft currently uses the same 
	// template as Entry and some objects e.g. the title are automatically 
	// popuplated by BaseItem using short_type as part of the dom selector.
	Draft.prototype.get_short_type = function() { return "entry"; };

	Draft.prototype.init = function( parms ) {
		var my = this;
		if( my.template==undefined ) {
			// FIXME: We should try to do only one request for the template,
			//        even if a bunch of objects are initiated the same time,
			//        e.g. at initial page load.
			GlobalRequestQueue.add({
				module : "render",
				args : {tpl : "elements/entry.html"},
				done : function(result) {
					Draft.prototype.template = result;
					my.init( parms );
				}, 
				fail : function(result) {
					parse_result( result );
				}
			});
			GlobalRequestQueue.process();
		} else {
			Entry.prototype.init.call( this, parms );
			
			// Try to load metadata of an origination parent entry, 
			// needed for saving etc.:
			// FIXME: It would be more robust if this information would be already available
			//        through the parent list of the draft object given to the constructor.
			if( my.obj && my.obj.id ) {
				get_module( "get", {
					"args" : {
						"child_id" : my.obj.id,
						"recursive" : false
					},
					"done" : function( result ) {
						result = parse_result( result );
						for( i in result ) {
							var parent = result[i];
							if( parent.type == "application/x-obj.entry" ) {
								my.parent_entry = parent;
								return;
							}
						}
					}
				});
			}

			my.button_save = $( ".entry-save-button", my.dom_object )[0];
			$(my.button_save).off("click").on( "click", function() { my.store_and_reload(); } );
			my.button_send = $( ".entry-send-button", my.dom_object )[0];
			$(my.button_send).off("click").on( "click", function() { my.publish(); } );
			my.button_discard = $( ".entry-draft-discard-button", my.dom_object )[0];
			$(my.button_discard).off("click").on( "click", function() { my.delete_draft(); } );
			my.edit_toolbar = $( ".entry-edit-toolbar", my.dom_object )[0];
			my.button_toggle_toolbar = $(".entry-toggle-toolbar", my.dom_object )[0];
			$(my.button_toggle_toolbar).off("click").on( "click", function() { $(my.edit_toolbar).slideToggle(); } );
			my.button_hyperlink = $( ".keysym-hyperlink", my.dom_object )[0];
			$(my.button_hyperlink).off("click").on( "click", function(){ my.on_keydown( {ctrlKey:true, key:'l', preventDefault:function(){}} ); } );
			my.button_highlight = $( ".keysym-highlight", my.dom_object )[0];
			$(my.button_highlight).off("click").on( "click", function(){ my.on_keydown( {ctrlKey:true, key:'h', preventDefault:function(){}} ); } );
			my.button_bold = $( ".keysym-bold", my.dom_object )[0];
			$(my.button_bold).off("click").on( "click", function(){ my.on_keydown( {ctrlKey:true, key:'b', preventDefault:function(){}} ); } );
			my.button_italic = $( ".keysym-italic", my.dom_object )[0];
			$(my.button_italic).off("click").on( "click", function(){ my.on_keydown( {ctrlKey:true, key:'i', preventDefault:function(){}} ); } );
			my.button_fixed = $( ".keysym-fixed", my.dom_object )[0];
			$(my.button_fixed).off("click").on( "click", function(){ my.on_keydown( {ctrlKey:true, key:'m', preventDefault:function(){}} ); } );
			my.button_underline = $( ".keysym-underline", my.dom_object )[0];
			$(my.button_underline).off("click").on( "click", function(){ my.on_keydown( {ctrlKey:true, key:'u', preventDefault:function(){}} ); } );
			my.button_overline = $( ".keysym-overline", my.dom_object )[0];
			$(my.button_overline).off("click").on( "click", function(){ my.on_keydown( {ctrlKey:true, key:'o', preventDefault:function(){}} ); } );
			my.button_strikethrough = $( ".keysym-strikethrough", my.dom_object )[0];
			$(my.button_strikethrough).off("click").on( "click", function(){ my.on_keydown( {ctrlKey:true, key:'s', preventDefault:function(){}} ); } );
			my.button_large = $( ".keysym-larger", my.dom_object )[0];
			$(my.button_large).off("click").on( "click", function(){ my.on_keydown( {ctrlKey:true, key:'+', preventDefault:function(){}} ); } );
			my.button_small = $( ".keysym-smaller", my.dom_object )[0];
			$(my.button_small).off("click").on( "click", function(){ my.on_keydown( {ctrlKey:true, key:'-', preventDefault:function(){}} ); } );
			my.button_toolbar_file = $( ".keysym-upload", my.dom_object )[0];
			$(my.button_toolbar_file).off("click").on( "click", function(){ my.on_keydown( {ctrlKey:true, key:'d', preventDefault:function(){}} ); } );
			my.button_tab_right = $( ".keysym-tab-right", my.dom_object )[0];
			$(my.button_tab_right).off("click").on( "click", function(){ my.on_keydown( {shiftKey:false, keyCode:9, preventDefault:function(){}} ); } );
			my.button_tab_left = $( ".keysym-tab-left", my.dom_object )[0];
			$(my.button_tab_left).off("click").on( "click", function(){ my.on_keydown( {shiftKey:true, keyCode:9, preventDefault:function(){}} ); } );
			my.button_toolbar_quote = $( ".keysym-quote", my.dom_object )[0];
			$(my.button_toolbar_quote).off("click").on( "click", function(){ my.on_keydown( {ctrlKey:true, key:'y', preventDefault:function(){}} ); } );
			my.button_toolbar_emoji = $( ".keysym-emoji", my.dom_object )[0];
			$(my.button_toolbar_emoji).off("click").on( "click", function(){ my.on_keydown( {ctrlKey:true, key:'e', preventDefault:function(){}} ); } );
			my.ctime_changer = $( ".entry-ctime-changer", my.dom_object )[0];
			my.ctime_changer_date = $( ".entry-ctime-date-input", my.dom_object )[0];
			$(my.ctime_changer_date).off("click").on("click", function(){ $(my.ctime_changer).addClass("active"); } );
			my.ctime_changer_time = $( ".entry-ctime-time-input", my.dom_object )[0];
			$(my.ctime_changer_time).off("click").on("click", function(){ $(my.ctime_changer).addClass("active"); } );
			my.ctime_change_button = $( ".entry-ctime-change-button" )[0];
			$(my.ctime_change_button).off("click").on("click", function() { $(my.ctime_changer).removeClass("active"); my.save_ctime_change(); } );
			my.ctime_cancel_button = $( ".entry-ctime-cancel-button" )[0];
			$(my.ctime_cancel_button).off("click").on("click", function() { $(my.ctime_changer).removeClass("active"); my.reload_ctime_changer(); } );
			my.reload_ctime_changer();
			
			$(my.entry).addClass("draft");
			
			var new_title = false;
			if( my.title ) {
				my.title.contentEditable = true
				my.title.focus();
				if( my.title.innerHTML.length==0 ) {
					// Create selection with ellipsis within emtpy title fields:
					new_title = true;
					var range = get_element_cursor_range();
					range.insertNode( new Text("...") );
					var sel = window.getSelection();
					sel.removeAllRanges();
					sel.addRange( range );
				}
			}
			if( my.content ) {
				my.content.contentEditable = true
				if( !new_title ) my.content.focus();
				
				$('.objref', my.content).each( function(i, element) {
					new UploadDialog( {replace_content: $(element).children().first()} );
				});
				
				$(my.content).off("keypress").on( "keypress", function(e) { my.on_keypress(e); } );
				$(my.content).off("keydown").on( "keydown", function(e) { my.on_keydown(e); } );
				
				my.change_notifier = $( ".change-notifier", my.dom_object );
				my.save_notifier = $( ".save-notifier", my.dom_object );
				my.change_timeout = null;
				my.saving = false;
				my.change_observer = new MutationObserver( function( event, observer ) {
					my.change_notifier.addClass( "active" );
					if( my.change_timeout ) {
						window.clearTimeout( my.change_timeout );
					}
					my.change_timeout = window.setTimeout( function() {
						my.change_notifier.removeClass( "active" );
						my.change_timeout = null;
						my.store();
					}, 3000 );
				});
				my.register_change_observations = function() {
					my.change_observer.observe( my.title, {childList : true, attributes : true, characterData : true, subtree : true} );
					my.change_observer.observe( my.content, {childList : true, attributes : true, characterData : true, subtree : true} );
					my.change_observer.observe( my.tags_content, {childList : true, attributes : true, characterData : true, subtree : true} );
				};
				my.register_change_observations();
			}
		}
	};
	
	Draft.prototype.on_keypress = function( event ) {
		var my = this;
		var key_char = String.fromCharCode( event.which );
		if( key_char=='-' || key_char=='*' ) {
			// Create new unordered list and first item in place of leading '-' or '*'
			// Working: Firefox, Chrome, Android Stock Browser
			// FIXME: Creation of lists not working at all in Mobile Chrome (different DOM?)
			// FIXME: Unable to edit text within newly created list items in Mobile Firefox
			// FIXME: Random crashes in Mobile Firefox?
			var range = get_element_cursor_range();
			var is_block_node = function( node ) {
				var block_names = {
					'DIV' : true,
					'BR' : true,
					'UL' : true,
					'OL' : true
				}
				return block_names[ node.nodeName ] ? true : false;
			}
			if( range 
				&& (
					(range.startContainer==my.content)
					|| range.startContainer.parentNode==my.content 
						&& ( 
							range.startOffset==0 /*first Node*/
							|| /*Firefox Newline*/ (range.startOffset>0 && range.startContainer.childNodes[range.startOffset-1] && is_block_node(range.startContainer.childNodes[range.startOffset-1]) )
							|| /*Chrome Newline*/ (range.startContainer.childNodes.length==1 && is_block_node(range.startContainer.childNodes[0]) )
						)
					)
				) {
				var new_list = $('<ul></ul>');
				var new_item = $('<li></li>');
				new_list.append( new_item );
				range.insertNode( new_list[0] );
				range.collapse();
				range.selectNodeContents( new_item[0] );
				// In Firefox the range is selected by selectNodeContents,
				// but in Chrome we have to clear the windows selection 
				// and add the new range explicitly:
				var sel = window.getSelection();
				sel.removeAllRanges();
				sel.addRange( range );
				event.preventDefault();
			}
		}
	};

	Draft.prototype.on_keydown = function( event ) {
		var my = this;
		var format_keys = {
			'h' : 'text-marking',
			'b' : 'text-bold',
			'i' : 'text-italic',
			'm' : 'text-fixed',
			'u' : 'text-underline',
			's' : 'text-strikethrough',
			'o' : 'text-overline',
			'+' : 'text-larger',
			'-' : 'text-smaller',
			'l' : 'link',
			'd' : 'upload',
			'y' : 'block-quote',
			'e' : 'emoji'
		}
		if( event.keyCode==8 ) {
			var range = get_element_cursor_range();
			// allow deletion of frozen elements with backspace:
			if( range && range.collapsed ) {
				var deletion_element = null;
				if( range.startContainer.nodeName=="#text" && range.startOffset==0 && range.startContainer.previousSibling ) {
					deletion_element = range.startContainer.previousSibling;
				} else if( range.startContainer.nodeName=="#text" && range.startOffset==0 && range.startContainer.parentNode.previousSibling ) {
					deletion_element = range.startContainer.parentNode.previousSibling;
				} else if( range.startContainer.nodeName!="#text" && range.startContainer.childNodes.length>=range.startOffset && range.startContainer.childNodes.length>1 ) {
					deletion_element = range.startContainer.childNodes[range.startOffset-1];
				} else if( range.startContainer.nodeName=="#text" ) {
					deletion_element = range.startContainer.parentNode;
				} else {
					deletion_element = range.startContainer;
				}
				if( deletion_element && (deletion_element.nodeName=="BR" || $(deletion_element).attr("contenteditable")=="false") ) {
					range.selectNode( deletion_element );
					range.extractContents();
					range.collapse();
					event.preventDefault();
				}
			}
		} else if( event.keyCode==46 ) {
			var range = get_element_cursor_range();
			// allow deletion of frozen elements with backspace:
			if( range && range.collapsed ) {
				var deletion_element = null;
				if( range.startContainer.nodeName=="#text" && range.startOffset==range.startContainer.length && range.startContainer.nextSibling ) {
					deletion_element = range.startContainer.nextSibling;
				} else if( range.startContainer.nodeName=="#text" && range.startOffset==range.startContainer.length && range.startContainer.parentNode.nextSibling ) {
					deletion_element = range.startContainer.parentNode.nextSibling;
				} else if( range.startContainer.nodeName!="#text" && range.startContainer.childNodes.length>(range.startOffset+1) && range.startContainer.childNodes.length>1 ) {
					deletion_element = range.startContainer.childNodes[range.startOffset+1];
				} else if( range.startContainer.nodeName=="#text" ) {
					deletion_element = range.startContainer.parentNode;
				} else {
					deletion_element = range.startContainer;
				}
				if( deletion_element && (deletion_element.nodeName=="BR" || $(deletion_element).attr("contenteditable")=="false") ) {
					range.selectNode( deletion_element );
					range.extractContents();
					range.collapse();
					event.preventDefault();
				}
			}
		}else if( event.keyCode==9 ) {
			var range = get_element_cursor_range();
			if( range ) {
				var list_item = range.startContainer.nodeName=='LI' ? range.startContainer : $(range.startContainer).closest('li')[0];
				if( list_item ) {
					if( event.shiftKey==false && list_item.previousSibling && list_item.previousSibling.nodeName=='LI' ) {
						var prev_list_item = list_item.previousSibling;
						$(list_item).detach();
						if( $(prev_list_item).children().last().length && $(prev_list_item).children().last()[0].nodeName=='UL' ) {
							$(prev_list_item).children().last().append( list_item );
						} else {
							$(prev_list_item).append( list_item );
							$(list_item).wrap('<ul></ul>');
						}
						range.collapse();
						range.selectNodeContents( list_item );
						range.collapse();
						var sel = window.getSelection();
						sel.removeAllRanges();
						sel.addRange( range );
					} else if( event.shiftKey==true && list_item.parentNode.parentNode.nodeName=='LI' ) {
						var list = list_item.parentNode;
						var parent_item = list_item.parentNode.parentNode;
						$(list_item).detach();
						$(list_item).insertAfter( parent_item );
						sibling_count = 0;
						for( var i=list.childNodes.length-1; i>=0; i-- ) {
							var li = list.childNodes[i];
							if( li.nodeName=='LI' ) {
								sibling_count++;
							}
						}
						if( sibling_count==0 ) $(list).remove();
						range.collapse();
						range.selectNodeContents( list_item );
						range.collapse();
						var sel = window.getSelection();
						sel.removeAllRanges();
						sel.addRange( range );
					}
				}
			}
			event.preventDefault();
		} else if( event.ctrlKey==true && format_keys[event.key]!=undefined ) {
			var format = format_keys[event.key];
			var range = get_element_cursor_range();
			if( format=='link' ) {
				var existing_links_found = false;
				// Zunächst alle existierenden Hyperlinks in aktueller (nicht leerer) Markierung suchen und ggf. bearbeiten:
				var links_to_edit = []; // But we must not modify the dom while iterating over it!
				for( var current_container = range.startContainer; 
						!range.collapsed && current_container != null;
						current_container = (current_container==range.endContainer || current_container.contains(range.endContainer) ? null : current_container.nextSibling) ) {
					if( current_container.nodeName=='A' ) links_to_edit.push( current_container );
					for( var i = (current_container==range.startContainer ? range.startOffset : 0 );
							current_container.nodeName!='#text' && i < (current_container==range.endContainer ? range.endOffset : current_container.length);
							i++ ) {
						var current_node = current_container.childNodes[i];
						if( current_node ) {
							if( current_node.nodeName=='A' ) links_to_edit.push( current_node );
							$( 'a', current_node ).each( function(i, item) { links_to_edit.push(item); } );
						}
					}
				}
				for( var i=0; i<links_to_edit.length; i++ ) {
					var new_link_tool = new LinkTool( {link_node: links_to_edit[i]} );
					existing_links_found = true;
				}
				// Alternativ tiefsten, existierenden Hyperlink an aktueller Cursorposition finden und bearbeiten:
				if( !existing_links_found ) {
					var closest_link = $(range.startContainer).closest('a')[0];
					if( closest_link ) {
						var new_link_tool = new LinkTool( {link_node: closest_link} );
						existing_links_found = true;
					}
				}
				// Alternativ den markierten (nicht leeren) Content als neuen Hyperlink auszeichnen:
				if( !existing_links_found && range.collapsed==false ) {
					var contents = range.extractContents();
					var new_link = $('<a></a>').attr({'href' : ''}).append(contents)[0];
					range.insertNode( new_link );
					var new_link_tool = new LinkTool( {link_node: new_link} );
				}
				range.collapse();
				event.preventDefault();
			} else if( format=='upload' ) {
				new UploadDialog( {dom_parent: my.content, wrap: true} );
				range.collapse();
				event.preventDefault();
			} else if( format=="block-quote" ) {
				// markierten Content in neuen Zitierungsblock verschieben:
				var contents = range.extractContents();
				var new_block = $('<div></div>').addClass("block-quote").append(contents)[0];
				range.insertNode( new_block );
				range.collapse();
				event.preventDefault();
			} else if( format=='emoji' ) {
				if( !my.emoji_selector ) {
					my.emoji_selector = new EmojiSelector( {
						dom_parent: my.edit_toolbar, 
						emoji_select_callback: function( emoji_text ) {
							var range = get_element_cursor_range();
							range.collapse();
							// FIXME: freeze emoji spans (contendEditable="false"), to prevent insertion of non-emoji content:
							var emoji_node = $("<span></span>").text( emoji_text ).addClass("emoji").attr({"contentEditable":"false"})[0];
							range.insertNode( emoji_node );
							range.collapse();
						}
					} );
				} else {
					$(my.emoji_selector.dom_object).slideToggle();
				}
				event.preventDefault();
			} else if( !range.collapsed ) {
				var contents = range.extractContents();
				var remove_count = 0;
				// Die Textformatierungsklassen text-larger und text-smaller wirken relativ 
				// bezogen auf Elternelemente, und sollen daher beliebig geschachtelt werden können.
				if( !(format=="text-larger" || format=="text-smaller") ) {
					// Andere Textformatierungsklassen sollen innerhalb der Auswahl entfernt
					// werden, falls sie darin früher gesetzt wurden:
					$( "span."+format+",span."+format+"-off", contents ).each( function(i,item) {
						$(item).replaceWith( $(item).contents() );
						remove_count += 1;
					});
				}
				if( remove_count==0 ) {
					// Falls in der Auswahl keine passende Textformatierung entfernt werden konnte,
					// möchte der Nutzer:
					var closest_format_switching_ancestor = $(range.commonAncestorContainer).closest( "span."+format+",span."+format+"-off" ).first();
					if( closest_format_switching_ancestor.length && closest_format_switching_ancestor.hasClass(format) ) {
						// a) die bereits wirksame, passende Textformatierung eines Elternelementes innerhalb 
						// der Auswahl deaktivieren:
						range.insertNode( $('<span></span>').attr({'class' : format+"-off"}).append(contents)[0] );
					} else {
						// b) die passende Textformatierung auf die Auswahl aktivieren:
						range.insertNode( $('<span></span>').attr({'class' : format}).append(contents)[0] );
					}
					
				} else {
					range.insertNode( contents );
				}
				event.preventDefault();
			}
		} else {
			// standard keyboard events
		}
	};

	Draft.prototype.get_plain_text = function( element ) {
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
	
	Draft.prototype.store_and_reload = function() {
		var my = this;
		my.store( { "draft_stored_callback" : function() {
			// Reload a previously existing parent entry:
			// (Entry object has to be relaoded from server to be up-to-date.)
			if( my.parent_entry ) {
				get_module( "get", {
					"args" : {
						"id" : my.parent_entry.id,
						"recursive" : true
					},
					"done" : function( result ) {
						var entry_obj = parse_result( result )[0];
						if( entry_obj ) {
							new Entry( {obj:entry_obj, duplicates:true, dom_parent:my.dom_parent, prepend:true} );
							$(my.dom_object).remove();
						}
					}
				});
			} else {
				$(my.dom_object).remove();
			}
		}});
	}

	Draft.prototype.store = function( parms ) {
		var my = this;
		
		if( my.saving ) {
			// FIXME: Schedule retry or communicate failure to caller?
			return false;
		}
		
		my.saving = true;
		// We need to disconnect the MutationObserver during saving to prevent
		// a feedback loop that occures for currently unknown reasons:
		my.change_observer.disconnect();
		my.save_notifier.addClass( "active" );
		
		parms = parms ? parms : {};
		parms.draft_stored_callback = parms.draft_stored_callback ? parms.draft_stored_callback : function() {};
		var draft_stored_callback = function() {
			my.saving = false;
			my.register_change_observations();
			my.save_notifier.removeClass( "active" );
			parms.draft_stored_callback();
		};
		
		var new_entry_created = false;
		if( !my.obj || !my.obj.id ) {
			// Entry.prototype.store() erledigt die eigentliche Speicherung
			new_entry_created = true;
		}
		if( my.title ) {
			my.obj.title = my.get_plain_text( my.title )
		}
		Entry.prototype.store.call( my, {callback: function() {
			if( my.content ) {
				var cloned_store_content = $(my.content).clone(true,true);
				var upload_dialogs = $( ".upload-dialog", cloned_store_content );
				upload_dialogs.each( function(i, upload_dialog) {
					// The following is basically a copy of UploadDialog.confirm_upload(), 
					// that we cannot call because for from internal references of the cloned 
					// UploadDialog instance within cloned_store_content:
					var upload_object = $( ".upload-object", upload_dialog ).first().detach();
					$(upload_dialog).after( upload_object );
					$(upload_dialog).remove();
				});
				var old_objrefs = $( ".objref", cloned_store_content );
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
				var text_nodes = get_text_nodes_in( cloned_store_content[0] );
				for( var i in text_nodes ) {
					var text_node = text_nodes[i];
					if( $(text_node).closest('a').length==0 ) {
						$(text_node).replaceWith( $(text_node).text().replace(/(https?:\/\/[^ ]+)/gim,'<a href="$1" target="_blank">$1</a>') );
					}
				}
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
				extract_children( cloned_store_content, content_data );
				// Enumerate Tags:
				var tag_data = { html_obj:{}, extracted_children:[] };
				if( my.tags_content ) {
					var store_tags_content = $(my.tags_content).clone(true,true);
					extract_children( store_tags_content, tag_data );
				}
				
				// Inhalt speichern:
				var html_obj = content_data.html_obj;
				$(".entry-html",cloned_store_content).children().unwrap();
				html_obj.data = cloned_store_content.html();
				var html_store_args = { type: html_obj.type, parent_id: String(my.obj.id) };
				if( html_obj.id ) {
					html_store_args.id = html_obj.id;
				}
				post_module( "store", {
					args : html_store_args,
					data: { "data" : html_obj.data },
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
									data : {parent_id : String(parent_id), child_not_in : child_not_in.join(",")},
									done : done
								});
							}
							if( content_id_list.length ) {
								post_module( "store", {
									data : { parent_id: String(html_id), id: content_id_list.join(",") },
									done : function(result) {
										result = parse_result(result);
										if( result.succeeded && result.id ) {
											delete_childs_not_in( html_id, content_id_list, function(){} );
										}
									}
								});
							} else {
								delete_childs_not_in( html_id, [], function(){} );
							}
							// Beitragstext, Tags (TODO: und andere dem Beitrag direkt untergeordnete Objekte) speichern und verbliebene Kindobjekte bereinigen:
							var tag_id_list = [];
							for( var i in tag_data.extracted_children ) {
								var obj = tag_data.extracted_children[i];
								if( obj && obj.id ) {
									tag_id_list.push( obj.id );
								}
							}
							if( tag_id_list.length ) {
								post_module( "store", {
									data : { parent_id: String(my.obj.id), id: tag_id_list.join(",") },
									done : function(result) {
										result = parse_result(result);
										if( result.succeeded && result.id ) {
											delete_childs_not_in( my.obj.id, [html_id].concat(tag_id_list), draft_stored_callback );
										}
									}
								});
							} else {
								delete_childs_not_in( my.obj.id, [html_id], draft_stored_callback );
							}
						}
					}
				});
			}
		}});
	};
	
	Draft.prototype.publish = function() {
		var my = this;
		var publish_method = "publish";
		if( my.parent_entry ) {
			// FIXME: Merging is currently forced for drafts originating from an entry.
			// We could provide an option to publish the draft as a modified clone of the 
			// original entry though.
			publish_method = "merge_to_parent";
		}
		my.store( { draft_stored_callback : function() {
			get_module( "entry", {
				"args" : {
					"id" : my.obj.id, 
					"method" : publish_method
				},
				"done" : function( result ) {
					result = parse_result( result );
					if( result && result.succeeded && result.entry && result.entry.id ) {
						if( my.parent_entry && publish_method=="publish" ) {
							// For a republished/cloned entry a previously existing parent entry must also be reloaded:
							get_module( "get", {
								"args" : {
									"id" : my.parent_entry.id,
									"recursive" : true
								},
								"done" : function( result ) {
									var entry_obj = parse_result( result )[0];
									if( entry_obj ) {
										new Entry( {obj:entry_obj, duplicates:true, dom_parent:my.dom_parent, prepend:true} );
									}
								}
							});
						}
						new Entry( {obj:result.entry, duplicates:true, dom_parent:my.dom_parent, prepend:true} );
						$(my.dom_object).remove();
					}
				}
			});
		}});
	};
	
	Draft.prototype.delete_draft = function() {
		var my = this;
		// FIXME: i18n
		Confirm.confirm( {message: 'Diesen Entwurf verwerfen?', before: $(my.entry_tools).first(),
			ok_callback: function( parms ) {
				if( my.obj.id ) {
					get_module( "delete", {
						args : {id : String(my.obj.id)},
						done : function( result ) {
							result = parse_result( result );
							if( result.succeeded ) {
								// Reload a previously existing parent entry:
								// (Entry object has to be relaoded from server to be up-to-date.)
								if( my.parent_entry ) {
									get_module( "get", {
										"args" : {
											"id" : my.parent_entry.id,
											"recursive" : true
										},
										"done" : function( result ) {
											var entry_obj = parse_result( result )[0];
											if( entry_obj ) {
												new Entry( {obj:entry_obj, duplicates:true, dom_parent:my.dom_parent, prepend:true} );
												$(my.dom_object).remove();
											}
										}
									});
								} else {
									$(my.dom_object).remove();
								}
							}
						}
					});
				} else {
					// Virtual drafts are simply removed from the dom tree:
					$(my.dom_object).remove();
				}
			}
		});
	};
	
	Draft.prototype.reload_ctime_changer = function() {
		var my = this;
		if( my.obj && my.obj.ctime ) {
			var entry_ctime = prettyprint_date_and_time( my.obj.ctime );
			$( my.ctime_changer_date ).val( entry_ctime.date_normalized );
			$( my.ctime_changer_time ).val( entry_ctime.time );
		}
	}
	
	Draft.prototype.save_ctime_change = function() {
		var my = this;
		var iso8601_string = $(my.ctime_changer_date).val() + "T" + $(my.ctime_changer_time).val();
		var seconds_since_epoch = Date.parse( iso8601_string ) / 1000;
		my.obj.ctime = seconds_since_epoch;
		get_module( "store", {
			"args" : {
				"id" : my.obj.id,
				"ctime" : seconds_since_epoch
			},
			"done" : function( result ) {
				var result = parse_result( result );
				if( result.succeeded ) {
					my.reload_ctime_changer();
					// Update primary Draft ctime display:
					my.update_standard_fields();
				}
			}
		});
	}
	
	return Draft;
}); //define()

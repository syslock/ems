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

	Entry.prototype.init = function( parms ) {
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
					my.init( parms );
				}, 
				fail : function(result) {
					show_error( result )
				}
			});
			GlobalRequestQueue.process();
		} else {
			BaseItem.prototype.init.call( this, parms );
			my.entry = $( ".ems-entry", my.dom_object )[0];
			my.title = $( ".entry-title", my.entry )[0];
			my.content = $( ".entry-content", my.entry )[0];
			my.entry_tools = $( ".entry-tools", my.entry )[0];
			my.entry_tags = $( ".entry-tags", my.entry_tools )[0];
			my.author = $('.entry-author', my.dom_object)[0];
			my.tags_selection = $(".entry-tags-selection", my.entry)[0];
			my.tags_searchbar = $(".entry-tags-searchbar", my.entry)[0];
			my.tags_search_result = $(".entry-tags-search-result", my.entry)[0];
			my.tags_search_result_scroll_container_hack = $(".entry-tags-search-result-scroll-container-hack", my.entry)[0];
			my.tags_content = $(".entry-tags-content", my.entry)[0];
			my.button_title_search = $(".entry-title-search-button", my.entry)[0];
			
			if( !parms.preserve_content ) {
				$(my.content).empty();
				$(my.author).empty();
				$(my.tags_content).empty();
			}
			
			if( my.dom_parent ) {
				for( var i in my.obj.children ) {
					var dom_parent = my.content;
					var child = my.obj.children[i];
					if( child.type == "application/x-obj.tag" ) {
						dom_parent = my.tags_content;
					}
					if( child.type == "application/x-obj.draft" ) {
						my.draft_object = my.obj.children[i];
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
			$(my.button_show_tag_selection).off("click").on( "click", function(){ my.show_tag_selection(); } );
			my.button_hide_tag_selection = $( ".entry-tags-close-selection-button", my.dom_object )[0];
			$(my.button_hide_tag_selection).off("click").on( "click", function(){ my.hide_tag_selection(); } );
			my.button_respond = $( ".entry-response-button", my.dom_object )[0];
			$(my.button_respond).off("click").on( "click", function(){ my.new_response(); } );
			my.button_link_external = $( ".entry-link-button", my.dom_object )[0];
			$(my.button_link_external).off("click").on( "click", function(){ my.link_external(); } );
			my.button_edit = $( ".entry-edit-button", my.dom_object )[0];
			$(my.button_edit).off("click").on( "click", function(){ my.edit(); } );
			my.button_delete = $( ".entry-delete-button", my.dom_object )[0];
			$(my.button_delete).off("click").on( "click", function(){ my.delete_entry(); } );
			
			$(my.button_title_search).on("click", function() {
				var search_text = $(my.title).text();
				if ( search_text.startsWith("Re") )
				{
					search_text = search_text.replace(/^Re: /, "");
				}
				global_search.entry.text( "title:\""+search_text+"\"" );
				global_search.search();
			});
			
			$(my.dom_object).off("mousemove").on( "mousemove", function( event ) {
				if( window.scrollY > ($(my.dom_object).position().top-100) 
						&& window.scrollY < ($(my.dom_object).position().top+$(my.dom_object).height()-200) ) {
					$(my.entry_tools).addClass("fixed");
				} else {
					$(my.entry_tools).removeClass("fixed");
				}
			});
		}
	}

	Entry.prototype.edit = function() {
		var my = this;
		if( my.draft_object && my.draft_object.id ) {
			get_module( "get", {
				"args" : {
					"id" : my.draft_object.id,
					"recursive" : true
				},
				"done" : function( result ) {
					var draft_obj = parse_result( result )[0];
					if( draft_obj ) {
						new Draft( {obj:draft_obj, duplicates:true, dom_parent:my.dom_parent, prepend:true} );
						$(my.dom_object).remove();
					}
				}
			});
		} else {
			get_module( "entry", {
				"args" : {
					"id" : my.obj.id, 
					"method" : "create_draft"
				},
				"done" : function( result ) {
					result = parse_result( result );
					if( result && result.succeeded && result.draft && result.draft.id ) {
						new Draft( {obj:result.draft, duplicates:true, dom_parent:my.dom_parent, prepend:true} );
						$(my.dom_object).remove();
					}
				}
			});
		}
	};

	Entry.prototype.new_response = function() {
		var my = this;
		var user = global_user; // FIXME: should not use globals
		var new_draft = new Draft( {virtual:true, obj:{parents:[user],permissions:['read','write']}, duplicates:true, dom_parent:my.dom_parent, prepend:true} );
		$(my.dom_object).before( $(new_draft.dom_object).detach() );
		// Antworttitel aus Titel des Referenzbeitrages generieren:
		var reference_title = $(my.title).text();
		if( !reference_title.match(/^Re:/i) ) {
			reference_title = "Re: "+reference_title;
		}
		$(new_draft.title).text( reference_title );
		// Themen des Referenzbeitrages kopieren:
		$(new_draft.tags_content).empty().append( $(my.tags_content).contents().clone(true,true) );
	};

	Entry.prototype.delete_entry = function() {
		var my = this;
		Confirm.confirm( {message: 'Diesen Eintrag wirklich löschen?', before: $(my.entry_tools).first(),
			ok_callback: function( parms ) {
				get_module( "delete", {
					args : {id : String(my.obj.id)},
					done : function( result ) {
						result = parse_result( result );
						if( result.succeeded ) {
							$(my.dom_object).remove();
						}
					}
				});
			}
		});
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
					scroll_handler : function(parms) { tag_search.search(parms); },
					scroll_condition : "element_scroll_condition"
				} );
			},
			on_ready : function() {
				var entry = my; // FIXME: needing to use this reference backups is a bit creepy
				var tag_search = this; // Use this reference for tag_search, as the constructor might not yet have returned
				$(entry.tags_selection).show();
				tag_search.entry.outerWidth( $(entry.tags_selection).innerWidth()*0.95 );
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

// FIXME: module encapsulation:
var VideoItem = null;

define(["jquery","item","video_variant"], function($,BaseItem,VideoVariant) {
	
	VideoItem = function( parms ) {
		parms = parms ? parms : {};
		BaseItem.call( this, parms );
	};
	VideoItem.prototype = Object.create( BaseItem.prototype );
	VideoItem.prototype.constructor = VideoItem;
	
	VideoItem.prototype.init = function() {
		if( this.template==undefined ) {
			// FIXME: We should try to do only one request for the template,
			//        even if a bunch of objects are initiated the same time,
			//        e.g. at initial page load.
			GlobalRequestQueue.add({
				module : "render",
				args : {tpl : "elements/video.html"},
				done : function(result) {
					VideoItem.prototype.template = result;
					this.init();
				}.bind(this),
				fail : function(result) {
					show_error( result );
				}.bind(this)
			});
			GlobalRequestQueue.process();
		} else {
			BaseItem.prototype.init.call( this );
			this.box = $( ".video-box", this.dom_object );
			this.video = $( ".video", this.dom_object );
			this.dom_player = this.video[0];
			this.status = $( ".video-status", this.dom_object );
			this.status_image = $( ".video-status-image", this.status );
			this.status_text = $( ".video-status-text", this.status );
			this.dom_player.addEventListener( 'canplay', function(event) {
				this.status.hide();
			}.bind(this) );
			this.variants_element = $( ".video-variants", this.dom_object );
			this.variant_items = [];
			
			this.dom_player.onplay = function() { this.status.hide(); }.bind(this);
			this.dom_player.onmouseover = function() { this.dom_player.preload="metadata"; }.bind(this);
		
			// quick lookup of already available variants:
			GlobalRequestQueue.add( {
				module : "convert",
				args : {mode : "status", id : this.obj.id, view : "all"},
				done : this.conversion_callback.bind(this)
			} );
			GlobalRequestQueue.process();
		}
	};
	
	VideoItem.prototype.identification_callback = function( raw_result ) {
		var result = parse_result( raw_result );
		if( result.succeeded ) {
			this.variants_element.empty();
			this.variant_items.splice([]);
			for( var i=0; i < result.objects.length; i++ ) {
				var obj = result.objects[i];
				var variant_item = new VideoVariant( {obj:obj, dom_parent:this.variants_element, duplicates:true, parent:this, 
					item_ready: function(item) {
						this.variant_items.push( item );
						if( this.selected_variant ) {
							this.select_variant( this.selected_variant );
						}
					}.bind(this)
				});
			}
		}
	};
	
	VideoItem.prototype.select_variant = function( variant_item ) {
		this.selected_variant = variant_item;
		for( var i=0; i<this.variant_items.length; i++ ) {
			var item = this.variant_items[i];
			item.update_selection_state( this.selected_variant );
		}
		this.dom_player.src = get_module_url( "get", {id: this.selected_variant.obj.id, view: "data"} );
	};
	
	VideoItem.prototype.conversion_callback = function( result ) {
		result = parse_result( result );
		if( result.succeeded ) {
			var stale_source_count = 0;
			var ready_source_count = 0;
			var identification_request_list = [ this.obj.id ];
			this.status_text.empty();
			for( var i=0; result.substitutes.length && i<result.substitutes.length; i++ ) {
				var substitute = result.substitutes[i];
				var conv_obj = substitute.substitute_object[0];
				if( conv_obj.type.match('^video/.*') ) {
					if( conv_obj.size>0 ) {
						this.status_text.append( $('<div>').attr({class: 'video-status-success'}).text(conv_obj.type+": OK") );
						ready_source_count++;
						// use first compatible video source:
						if( !this.dom_player.src && this.dom_player.canPlayType(conv_obj.type) ) {
							this.select_variant( {obj: {id: conv_obj.id}} );
						}
						identification_request_list.push( conv_obj.id );
					} else {
						this.status_text.append( $('<div>').attr({class: 'video-status-warning'}).text(conv_obj.type+": processing") );
						stale_source_count++;
					}
				} else if( conv_obj.type.match('^image/.*') ) {
					if( conv_obj.size>0 ) {
						this.status_text.append( $('<div>').attr({class: 'video-status-success'}).text(conv_obj.type+": OK") );
						ready_source_count++;
						this.video.attr( {poster: get_module_url("get", {id : conv_obj.id, view : "data"})} );
						// The poster_callback hack is currently used by UploadDialog
						// to update its separate poster drop field, when loading
						// media content. FIXME: should be replaced with VideoItem-API
						var poster_callback = $(this.dom_object).data("poster_callback");
						if( poster_callback ) {
							poster_callback( conv_obj );
						}
					} else {
						this.status_text.append( $('<div>').attr({class: 'video-status-warning'}).text(conv_obj.type+": processing") );
						stale_source_count++;
					}
				}
			}
			GlobalRequestQueue.add( {
				module : "identify",
				args : {id : identification_request_list.join(",")},
				done : this.identification_callback.bind(this)
			});
			GlobalRequestQueue.process();
			
			// use original video source as a fallback if compatible:
			if( !this.dom_player.src && this.dom_player.canPlayType(this.obj.type) ) {
				this.select_variant( {obj: {id: this.obj.id}} );
			}
			
			if( ready_source_count+stale_source_count==0 ) {
				// queue long conversion request for missing variants:
				GlobalRequestQueue.add( {
					module : "convert",
					args : {mode : "convert", id : this.obj.id, view : "all"},
					done : this.conversion_callback.bind(this)
				}, "long" );
				GlobalRequestQueue.process();
			} else if( stale_source_count==0 ) {
				this.status.hide();
			}
			if( !this.dom_player.src ) {
				window.setTimeout( function() {
					// repeat variant lookup after a few seconds, until compatible source is found:
					GlobalRequestQueue.add( {
						module : "convert",
						args : {mode : "status", id : this.obj.id, view : "all"},
						done : this.conversion_callback.bind(this)
					} );
					GlobalRequestQueue.process();
				}.bind(this), 5000 );
			}
		}
	};

	return VideoItem;
}); //define()

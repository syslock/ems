// FIXME: module encapsulation:
var MediaVariant = null;

define(["jquery","item"], function($,BaseItem) {
	
	MediaVariant = function( parms ) {
		parms = parms ? parms : {};
		BaseItem.call( this, parms );
	};
	MediaVariant.prototype = Object.create( BaseItem.prototype );
	MediaVariant.prototype.constructor = MediaVariant;
	
	MediaVariant.prototype.init = function() {
		if( this.template==undefined ) {
			// FIXME: We should try to do only one request for the template,
			//        even if a bunch of objects are initiated the same time,
			//        e.g. at initial page load.
			GlobalRequestQueue.add({
				module : "render",
				args : {tpl : "elements/media_variant.html"},
				done : function(result) {
					MediaVariant.prototype.template = result;
					this.init();
				}.bind(this),
				fail : function(result) {
					parse_result( result );
				}.bind(this)
			});
			GlobalRequestQueue.process();
		} else {
			// delay item readiness callback:
			var delayed_item_ready = this.item_ready;
			this.item_ready = function() {};
			BaseItem.prototype.init.call( this );
			this.variant_box = $( ".media-variant", this.dom_object );
			this.type_label = $( ".media-type-label", this.dom_object );
			this.dimensions_label = $( ".media-dimensions-label", this.dom_object );
			this.rate_label = $( ".media-rate-label", this.dom_object );
			this.download = $( ".media-download", this.dom_object );
			
			if( this.parent ) {
				if( this.parent.video && this.parent.video[0].canPlayType(this.obj.type) 
					|| this.parent.audio && this.parent.audio[0].canPlayType(this.obj.type)
				) {
					this.variant_box.addClass( "canplay" );
				} else {
					this.variant_box.addClass( "cannotplay" );
				}
				this.variant_box.bind( "click", function(event) {
					this.parent.select_variant( this );
				}.bind(this) );
			}
			
			this.type_label.text( this.obj.type );
			if( this.obj.mplayer ) {
				if( this.obj.mplayer.id.video ) {
					this.dimensions_label.text( String(this.obj.mplayer.id.video.width)+"x"+String(this.obj.mplayer.id.video.height) )
				}
				if( this.obj.mplayer.id.length ) {
					this.rate = Number(this.obj.size)*8 / Number(this.obj.mplayer.id.length);
					this.rate_label.text( prettyprint_size(this.rate,/*bit=*/true)+"/s" );
				}
			}
			this.download.append( create_download(this.obj) );
			delayed_item_ready( this );
		}
	};
	
	MediaVariant.prototype.update_selection_state = function( selected_variant ) {
		if( selected_variant.obj.id == this.obj.id ) {
			this.variant_box.addClass( "selected" );
		} else {
			this.variant_box.removeClass( "selected" );
		}
	};

	return MediaVariant;
}); //define()

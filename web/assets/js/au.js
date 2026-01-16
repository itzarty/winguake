const $a = ( a, b ) => [ ... ( b ? a : document ).querySelectorAll( b || a ) ];
const $s = ( a, b ) => $a( a, b )?.at( 0 );

const $n = properties => {
	if( !properties.duplicate ) properties.duplicate = 1;
	const elements = [ ];
	for( let i = 0; i < properties.duplicate; i++ ) {
		if( properties.template ) {
			const temporaryParent = $n( { tag: 'temp' } );
			const { html, transformations } = properties.template;
			const variables = properties.variables;
			let _html = html;
			if( variables ) {
				for( const variable of Object.keys( variables ) ) {
					_html = _html.replaceAll( `{${ variable }}`, variables[ variable ] );
				}
			}
			temporaryParent.innerHTML = _html;
			const element = $s( temporaryParent, '*' );
			const returns = { };
			const _returns = $a( temporaryParent, '[return]' );
			for( const element of _returns ) {
				const name = element.getAttribute( 'return' );
				returns[ name ] = element;
				element.removeAttribute( 'return' );
			}
			if( transformations ) {
				for( const transformation of Object.keys( transformations ) ) {
					const transform = transformations[ transformation ];
					const elements = $a( temporaryParent, `[transformation=${ transformation }]` );
					for( const element of elements ) {
						transform( element, variables, returns );
						element.removeAttribute( 'transformation' );
					}
				}
			}
			element.returns = returns;
			properties.prepend ? properties.parent.prepend( element ) : properties.parent.appendChild( element );
			temporaryParent.remove( );
			elements.push( element );
			continue;
		}
		const element = document.createElement( properties.tag );
		for( const property of Object.keys( properties ) ) {
			const value = properties[ property ];
			switch( property ) {
				case 'tag':
				case 'style':
					break;
				case 'parent':
					const parent = typeof value == 'string' ? $s( value ) : value;
					if( !parent ) break;
					properties.prepend ? properties.parent.prepend( element ) : properties.parent.appendChild( element );
					break;
				case 'text':
					element.innerText = value;
					break;
				case 'html':
					element.innerHTML = value;
					break;
				default:
					if( typeof value == 'string' ) {
						element.setAttribute( property, value );
						break;
					}
					element[ property ] = value;
					break;
			}
			if( properties.style ) {
				for( const property of Object.keys( properties.style ) ) {
					element.style[ property ] = properties[ property ];
				}
			}
		}
		elements.push( element );
	}
	if( properties.duplicate == 1 ) {
		return elements[ 0 ];
	}
	return elements;
}

const $qn = function( ) {
	let struct = { }
	const args = [ ... arguments ];
	const selector = args.shift( );
	const [ tagClass, id ] = selector.split( '#' );
	const [ tag, ... classes ] = tagClass.split( '.' );
	struct.tag = tag || 'div';
	struct.class = classes.join( ' ' );
	for( const arg of args ) {
		if( typeof arg == 'string' ) {
			struct.html = arg;
			continue;
		}
		if( arg instanceof HTMLElement ) {
			struct.parent = arg;
			continue;
		}
		struct = { ... struct, ... properties }
	}
	const element = $n( struct );
	return element;
}

const remainderUnits = [ 'ms', 's', 'm', 'h', 'd' ];
const formatRemainder = ms => {
	let remainder = ms / 1000;
	let slaveRemainder = 0;
	let level = 0;
	// S -> M
	if( remainder >= 60 ) {
		level++;
		remainder /= 60
		slaveRemainder = ( remainder % 1 ) * 60
	}
	// M -> H
	if( remainder >= 60 && level == 1 ) {
		level++;
		remainder /= 60
		slaveRemainder = ( remainder % 1 ) * 60
	}
	// H -> D
	if( remainder >= 24 && level == 2 ) {
		level++;
		remainder /= 24
		slaveRemainder = ( remainder % 1 ) * 24
	}
	return `${ Math.floor( remainder ) }${ remainderUnits[ level + 1 ] }${ level > 0 && Math.round( slaveRemainder ) > 0 ? ` ${ Math.round( slaveRemainder ) }${ remainderUnits[ level ] }` : '' }`
}

const unitLevels = [
	{
		unit: 'b',
		multiplier: 8
	},
	{
		unit: 'B',
		multiplier: 1024
	},
	{
		unit: 'KB',
		multiplier: 1024
	},
	{
		unit: 'MB',
		multiplier: 1024
	},
	{
		unit: 'GB',
		multiplier: 1024
	},
	{
		unit: 'TB',
		multiplier: 1024
	}
];

const unitString = ( size = 0, level = 0 ) => {
	let unitLevel = unitLevels[ level ];
	while( size >= unitLevel.multiplier ) {
		if( !unitLevels[ level + 1 ] ) {
			break;
		}
		size /= unitLevel.multiplier;
		level++;
		unitLevel = unitLevels[ level ];
	}
	const unit = unitLevel.unit;
	size = ( Math.round( size * 100 ) / 100 ).toString( );
	if( size.includes( '.' ) && size.at( -1 ) == '0' ) size = size.slice( 0, -1 );
	return `${ size }${ unit }`;
}

const sleep = ms => new Promise( resolve => setTimeout( resolve, ms ) );

const percent = ( a, b ) => Math.round( ( a / b ) * 100 );

const loadESM = ( src, module ) => new Promise( resolve => {
	const script = `import ${ module ? `{${ module }}` : '* as mod' } from '${ src }';window.esmInherit(${ module || 'mod.default||mod' })`;
	const element = $n( {
		tag: 'script',
		type: 'module',
		text: script,
		parent: document.head
	} );
	window.esmInherit = mod => {
		resolve( mod );
		element.remove( );
	}
} );

Array.prototype.compare = function( array ) {
	if( this.length != array.length ) return false;
	for( let i = 0; i < this.length; i++ ) {
		if( this[ i ] != array[ i ] ) return false;
	}
	return true;
}
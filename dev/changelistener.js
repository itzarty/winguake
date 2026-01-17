const changeListener = ( object, callbacks ) => {
    if( !( object instanceof Object ) ) return object;

    for( const key in object ) {
        const hook = callbacks[ key ];
        if( !hook ) continue;
        const value = object[ key ];
        if( typeof hook == 'object' && typeof value == 'object' ) {
            object[ key ] = changeListener( value, hook );
        }
    }

    return new Proxy( object, {
        set: ( target, property, value, receiver ) => {
            target[ property ] = value;
            const callback = callbacks[ property ];
            if( typeof callback === 'function' ) callback( value );
            return true;
        }
    });
}

const testorig = { hello: 'test', lol: { test: true } };
const testcb = { hello: console.log, lol: { test: console.error } };

const test = changeListener(testorig, testcb);
test.lol.test = 'lol'; // Console: "lol"
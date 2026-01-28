const { performance } = require( 'perf_hooks' );
let last = performance.now( );
module.exports = mark => {
    const stamp = performance.now( );
    const delta = ( stamp - last ).toFixed( 2 );
    console.log( `[BENCHMARK] "${ mark }" reached after ${ delta }ms [${ stamp }]` );
    last = stamp;
}
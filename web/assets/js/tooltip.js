const tooltipElement = $s( '.tooltip' );

window.addEventListener( 'mousemove', event => {
    const element = event.target;

    tooltipElement.style.top = event.y + 'px';
    tooltipElement.style.left = event.x + 'px';
    if( !element.hasAttribute( 'tooltip' ) ) {
        tooltipElement.classList.remove( 'active' );
        return;
    }

    const tooltip = element.getAttribute( 'tooltip' );
    tooltipElement.innerText = tooltip;
    tooltipElement.classList.add( 'active' );
} );
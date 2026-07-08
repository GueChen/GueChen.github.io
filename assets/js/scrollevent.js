// $(document).ready(function() {
//     var $tocSidebar = $('#toc-side'); // Your TOC sidebar element
//     var tocOffsetTop = $tocSidebar.offset().top; // Initial position of TOC
  
//     // Update the sticky effect as the user scrolls
//     $(window).on('scroll', function() {
//       var scrollTop = $(window).scrollTop();
  
//       // Check if the scroll position is below the original position of the TOC
//       if (scrollTop > tocOffsetTop) {
//         // Add a sticky class if necessary
//         $tocSidebar.addClass('sticky');
//       } else {
//         // Remove the sticky class when scrolling back up
//         $tocSidebar.removeClass('sticky');
//       }
//     });
  
//     // Optionally, recalculate the initial position if the page is resized
//     var resizeTimer;
//     $(window).on('resize', function() {
//       clearTimeout(resizeTimer);
//       resizeTimer = setTimeout(function() {
//         tocOffsetTop = $tocSidebar.offset().top; // Recalculate on resize
//       }, 100);
//     });
//   });
  
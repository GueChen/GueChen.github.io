$(function () {
    $('.slider').on('input', function () {
      if(this.step < 0.1) {
        const fixedValue = parseFloat(this.value).toFixed(2);  
        $(this).next('.slider-value').text(fixedValue);
      }
      else
      {
        $(this).next('.slider-value').text(this.value);
      }      
    });
  });
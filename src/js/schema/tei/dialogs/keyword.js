var $ = require('jquery');
//require('jquery-watermark');
var DialogForm = require('../../../dialogs/dialogForm.js');
require('jquery-ui/ui/widgets/button');

module.exports = function(id, writer) {
    var w = writer;
    
    var html = ''+
    '<div id="'+id+'Dialog" class="annotationDialog">'+
        '<div id="'+id+'RowsParent">'+
        '</div>'+
        '<div data-transform="accordion">'+
            '<h3>Markup options</h3>'+
            '<div id="'+id+'_attParent" class="attributes" data-type="attributes" data-mapping="attributes">'+
            '</div>'+
        '</div>'+
    '</div>';
    
    var dialog = new DialogForm({
        writer: w,
        id: id,
        type: 'keyword',
        title: 'Tag Keyword',
        height: 350,
        width: 350,
        html: html
    });
    
    function addRow(prevRow) {
        var newRow;
        // TODO add handling for multiple keywords, currently broken when loading a document
        var html = '<div class="keywordRow"><input type="text" value="" />';//<button type="button" class="add">Add Keyword</button>';
        if (prevRow == null) {
            html += '</div>';
            newRow = $('#'+id+'RowsParent').append(html).find('.keywordRow');
        } else {
            html += '<button type="button" class="remove">Remove This Keyword</button></div>';
            prevRow.after(html);
            newRow = prevRow.next();
        }
        newRow.find('button:first').button({
            icons: {primary: 'ui-icon-plusthick'},
            text: false
        }).click(function() {
            addRow($(this).parent());
        }).next('button').button({
            icons: {primary: 'ui-icon-minusthick'},
            text: false
        }).click(function() {
            removeRow($(this).parent());
        });
        newRow.find('input').watermark('Keyword');
        return newRow;
    }
    
    function removeRow(row) {
        row.remove();
    }
    
    dialog.$el.on('beforeSave', function(e, dialog) {
        dialog.currentData.customValues.keywords = [];
        $('#'+id+'Dialog .keywordRow').each(function(index, el) {
            var keyword = $('input', el).val();
            dialog.currentData.customValues.keywords.push(keyword);
        });
    });
    
    dialog.$el.on('beforeShow', function(e, config) {
        var keywordsParent = $('#'+id+'RowsParent');
            keywordsParent.find('.keywordRow').remove();
            if (dialog.mode === DialogForm.ADD) {
                addRow();
                dialog.attributesWidget.setData({type: 'keyword'});
                dialog.attributesWidget.expand();
            } else {
                var keywords = config.entry.getCustomValue('keywords');
                var prevRow = null;
                $.each(keywords, function(index, val) {
                    var row = addRow(prevRow);
                    row.find('input').val(val);
                    prevRow = row;
                });
            }
    });
    
    return {
        show: function(config) {
            dialog.show(config);
        }
    };
};

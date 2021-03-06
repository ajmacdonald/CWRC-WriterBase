//define(['jquery', 'jquery-ui', 'dialogs/cwrcDialogBridge', 'cwrcDialogs'], function($, jqueryUi, cwrcDialogBridge, cD) {
'use strict';

var $ = require('jquery');

//var cD = require('cwrc-dialogs');
var cwrcDialogBridge = require('./cwrcDialogBridge.js');

function CwrcOrg(writer) {
    var w = writer;
    var cD = writer.initialConfig.entityLookupDialogs;
    
    var schema = null;
    if (w.initialConfig.cwrcDialogs != null && w.initialConfig.cwrcDialogs.schemas != null) {
        schema = w.initialConfig.cwrcDialogs.schemas.organization;
    }
    if (schema == null) {
        schema = 'js/cwrcDialogs/schemas/entities.rng';
    }
    cD.setOrganizationSchema(schema);
    
    var bridge = new cwrcDialogBridge(w, {
        label: 'Organization',
        localDialog: 'org',
        cwrcType: 'organization'
    });
    
    return bridge;
};

module.exports = CwrcOrg;

'use strict';

var $ = require('jquery');
require('jquery-ui');
require('./lib/jquery/jquery-ui-core.js');
require('./lib/jquery/plugins/jquery.contextmenu.min.js');
require('./lib/jquery/plugins/jquery.watermark.min.js');
require('./lib/jquery/plugins/jquery.xpath.js');

//var tinymce = require('tinymce');
var Octokit = require('octokit');

window.tinymce = require('tinymce');

require('tinymce/themes/modern/theme.js');
require('./tinymce_plugins/cwrc_contextmenu.js');
require('./tinymce_plugins/cwrc_path.js');
require('./tinymce_plugins/schematags.js');
require('./tinymce_plugins/treepaste.js');


var EventManager = require('./eventManager.js');
var Utilities = require('./utilities.js');
var SchemaManager = require('./schema/schemaManager.js');
var DialogManager = require('./dialogManager.js');
var EntitiesManager = require('./entitiesManager.js');
var Tagger = require('./tagger.js');
var Converter = require('./converter.js');
var FileManager = require('./fileManager.js');
var AnnotationsManager = require('./annotationsManager.js');
var SettingsDialog = require('./dialogs/settings.js');
var layoutModules = require('./layout/layoutModules.js');

/**
 * @class CWRCWriter
 * @param {Object} config
 */
function CWRCWriter(config) {
    config = config || {};
    
    /**
     * @lends Writer.prototype
     */
    var w = {};
    
    w.initialConfig = config;
    
    w.layout = null; // jquery ui layout object
    w.editor = null; // reference to the tinyMCE instance we're creating, set in setup
    
    w.structs = {}; // structs store
    
    w.triples = []; // triples store
    // store deleted tags in case of undo
    // TODO add garbage collection for this
    w.deletedEntities = {};
    w.deletedStructs = {};
    
   // w.project = config.project || {}; // the current project (cwrc or russell)
    
    w.baseUrl = window.location.protocol+'//'+window.location.host+'/'; // the url for referencing various external services
    w.cwrcRootUrl = config.cwrcRootUrl; // the url which points to the root of the cwrcwriter location
    w.validationUrl = config.validationUrl || 'http://validator.services.cwrc.ca/validator/validate.html';// url for the xml validation
    if (w.cwrcRootUrl == null || w.cwrcRootUrl == '') {
        if (window.console) console.info("using default cwrcRootUrl");
        w.cwrcRootUrl = window.location.protocol+'//'+window.location.host+'/'+window.location.pathname.split('/')[1]+'/';
    }
    
    w.currentDocId = null;
    
    // root block element, should come from schema
    w.root = '';
    // header element: hidden in editor view, can only edit from structure tree
    w.header = '';
    // id attribute name, based on schema
    w.idName = '';
    
    // is the editor initialized
    w.isInitialized = false;
    
    // is the editor in readonly mode
    w.isReadOnly = false;
    if (config.readonly !== undefined && typeof config.readonly === 'boolean') {
        w.isReadOnly = config.readonly;
    }
    
    // is the editor in annotate (entities) only mode
    w.isAnnotator = false;
    
    // possible editor modes
    w.XMLRDF = 0; // XML + RDF
    w.XML = 1; // XML only
    w.RDF = 2; // RDF only (not currently used)
    
    w.JSON = 3; // annotation type
    
    // editor mode
    w.mode = w.XMLRDF;
    if (config.mode !== undefined) {
        if (config.mode === 'xml') {
            w.mode = w.XML;
        } else if (config.mode === 'rdf') {
            w.mode = w.RDF;
        }
    }
    
    // should we tell the user the editor mode after loading a document?
    w.showModeMessage = true;
    if (config.showModeMessage !== undefined && typeof config.showModeMessage === 'boolean') {
        w.showModeMessage = config.showModeMessage;
    }
    
    // what format to produce annotations in (XML or JSON)
    w.annotationMode = w.XML;
    
    // can entities overlap?
    w.allowOverlap = false;
    if (config.allowOverlap !== undefined && typeof config.allowOverlap === 'boolean') {
        w.allowOverlap = config.allowOverlap;
    }
    if (w.allowOverlap && w.mode === w.XML) {
        w.allowOverlap = false;
        alert('XML cannot overlap!');
    }
    
    // possible results when trying to add entity
    w.NO_SELECTION = 0;
    w.NO_COMMON_PARENT = 1;
    w.OVERLAP = 2;
    w.VALID = 3;
    
    w.emptyTagId = null; // stores the id of the entities tag to be added
    
    /**
     * Gets a unique ID for use within CWRC-Writer.
     * @param {String} prefix The prefix to attach to the ID.
     * @returns {String} id
     */
    w.getUniqueId = function(prefix) {
        var id = tinymce.DOM.uniqueId(prefix);
        return id;
    };
    
    /**
     * Selects a structure tag in the editor
     * @param id The id of the tag to select
     * @param selectContentsOnly Whether to select only the contents of the tag (defaults to false)
     */
    w.selectStructureTag = function(id, selectContentsOnly) {
        selectContentsOnly = selectContentsOnly == null ? false : selectContentsOnly;
        
        w.removeHighlights();
        
        if ($.isArray(id)) {
            // TODO add handling for multiple ids
            id = id[id.length-1];
        }
        
        var node = $('#'+id, w.editor.getBody());
        var nodeEl = node[0];
        if (nodeEl != null) {
            w.editor.currentStruct = id;
            var rng = w.editor.dom.createRng();
            if (selectContentsOnly) {
                if (tinymce.isWebKit) {
    //                $('[data-mce-bogus]', node).remove();
    //                node.prepend('<span data-mce-bogus="1">\uFEFF</span>').append('<span data-mce-bogus="1">\uFEFF</span>');
    //                rng.setStart(nodeEl.firstChild, 0);
    //                rng.setEnd(nodeEl.lastChild, nodeEl.lastChild.length);
                    if (nodeEl.firstChild == null) {
                        node.append('\uFEFF');
                    }
                    rng.selectNodeContents(nodeEl);
                } else {
                    rng.selectNodeContents(nodeEl);
                }
            } else {
                $('[data-mce-bogus]', node.parent()).remove();
                // no longer seems necessary
//                if (tinymce.isWebKit) {
//                    // if no nextElementSibling then only the contents will be copied in webkit
//                    if (nodeEl.nextElementSibling == null) {
//                        // sibling needs to be visible otherwise it doesn't count
//                        node.after('<span data-mce-bogus="1" style="display: inline;">\uFEFF</span>');
//                    }
//                    node.before('<span data-mce-bogus="1" style="display: inline;">\uFEFF</span>').after('<span data-mce-bogus="1" style="display: inline;">\uFEFF</span>');
//                    rng.setStart(nodeEl.previousSibling.firstChild, 0);
//                    rng.setEnd(nodeEl.nextSibling.firstChild, 0);
//                } else {
                    rng.selectNode(nodeEl);
//                }
            }
            
            w.editor.selection.setRng(rng);
            
            // scroll node into view
            var nodeTop;
            if (node.is(':hidden')) {
                node.show();
                nodeTop = node.position().top;
                node.hide();
            } else {
                nodeTop = node.position().top;
            }
            var newScrollTop = nodeTop - $(w.editor.getContentAreaContainer()).height()*0.25;
            $(w.editor.getDoc()).scrollTop(newScrollTop);
            
            // using setRng triggers nodeChange event so no need to call it manually
//            w._fireNodeChange(nodeEl);
            
            // need focus to happen after timeout, otherwise it doesn't always work (in FF)
            window.setTimeout(function() {
                w.editor.focus();
                w.event('tagSelected').publish(id, selectContentsOnly);
            }, 0);
        }
    };
    
    w.removeHighlights = function() {
        w.entitiesManager.highlightEntity();
    };
    
    /**
     * Load a document into the editor
     * @param docXml The XML content of the document
     * @param schemaURI The URI for the corresponding schema
     */
    w.loadDocument = function(docXml, schemaURI) {
        w.fileManager.loadDocumentFromXml(docXml);
    };

    w.showLoadDialog = function() {
        w.storageDialogs.load(w)
    }

    w.getHelp = function(tagName) {
        return w.utilities.getDocumentationForTag(tagName)
    }

    w.getDocumentation = function(fileName, callback) {
        var octo = Octokit.new({token: '15286e8222a7bc13504996e8b451d82be1cba397'});
        var templateRepo = octo.getRepo('cwrc', 'CWRC-Writer-Documentation');
        var branch = templateRepo.getBranch('master');
    
        branch.contents('out/xhtml/'+fileName).then(function(contents) {
            var doc = $.parseXML(contents);
            callback.call(w, doc);
        }, function() {
            w.dialogManager.show('message', {
                title: 'Error',
                type: 'error',
                msg: 'There was an error fetching the documentation for: '+fileName
            });
        });
    }

        /**
     * Gets the URI for the entity
     * @param {Object} entity The entity object
     * @returns {Promise} The promise object
     */
    w.getUriForEntity = function(entity) {
        var guid = w.utilities.createGuid();
        var uri = 'http://id.cwrc.ca/'+entity.getType()+'/'+guid;
        var dfd = new $.Deferred();
        dfd.resolve(uri);
        return dfd.promise();
    };
    
    /**
     * Gets the URI for the annotation
     * @param {Object} entity The entity object
     * @returns {Promise} The promise object
     */
    w.getUriForAnnotation = function() {
        var guid = w.utilities.createGuid();
        var uri = 'http://id.cwrc.ca/annotation/'+guid;
        var dfd = new $.Deferred();
        dfd.resolve(uri);
        return dfd.promise();
    };
    
    /**
     * Gets the URI for the document
     * @param {Object} entity The entity object
     * @returns {Promise} The promise object
     */
    w.getUriForDocument = function() {
        var guid = w.utilities.createGuid();
        var uri = 'http://id.cwrc.ca/doc/'+guid;
        var dfd = new $.Deferred();
        dfd.resolve(uri);
        return dfd.promise();
    };
    
    /**
     * Gets the URI for the target
     * @param {Object} entity The entity object
     * @returns {Promise} The promise object
     */
    w.getUriForTarget = function() {
        var guid = w.utilities.createGuid();
        var uri = 'http://id.cwrc.ca/target/'+guid;
        var dfd = new $.Deferred();
        dfd.resolve(uri);
        return dfd.promise();
    };
    
    /**
     * Gets the URI for the selector
     * @param {Object} entity The entity object
     * @returns {Promise} The promise object
     */
    w.getUriForSelector = function() {
        var guid = w.utilities.createGuid();
        var uri = 'http://id.cwrc.ca/selector/'+guid;
        var dfd = new $.Deferred();
        dfd.resolve(uri);
        return dfd.promise();
    };
    
    /**
     * Gets the URI for the user
     * @param {Object} entity The entity object
     * @returns {Promise} The promise object
     */
    w.getUriForUser = function() {
        var guid = w.utilities.createGuid();
        var uri = 'http://id.cwrc.ca/user/'+guid;
        var dfd = new $.Deferred();
        dfd.resolve(uri);
        return dfd.promise();
    };

    w.validate = function(callback) {
        var docText = w.converter.getDocumentContent(false);
        var schemaUrl = w.schemaManager.schemas[w.schemaManager.schemaId].url;
        
        w.event('validationInitiated').publish();
        
        $.ajax({
          //  url: w.baseUrl+'services/validator/validate.html',
            url: w.validationUrl,
            type: 'POST',
            dataType: 'xml',
            data: {
                sch: schemaUrl,
                type: 'RNG_XML',
                content: docText
            },
            success: function(data, status, xhr) {
                var valid = $('status', data).text() == 'pass';
                w.event('documentValidated').publish(valid, data, docText);
                if (callback) {
                    callback.call(w, valid);
                }
            },
            error: function() {
                if (callback) {
                    callback.call(w, null);
                } else {
                    w.dialogManager.show('message', {
                        title: 'Error',
                        msg: 'An error occurred while trying to validate the document.',
                        type: 'error'
                    });
                }
            }
        });
    }
    
    /**
     * Get the current document from the editor
     * @returns {Document} The XML document
     */
    w.getDocument = function() {
        var docString = w.converter.getDocumentContent(true);
        var doc = null;
        try {
            var parser = new DOMParser();
            doc = parser.parseFromString(docString, 'application/xml');
        } catch(e) {
            w.dialogManager.show('message', {
                title: 'Error',
                msg: 'There was an error getting the document:'+e,
                type: 'error'
            });
        }
        return doc;
    };

    w.getDocRawContent = function() {
        return w.editor.getContent({format: 'raw'})
    }
    w.showToolbar = function() {
        $('.mce-toolbar-grp', w.editor.getContainer()).first().show();
        if (w.layout) {
            w.layout.ui.resizeAll();
        }
    }
    
    w.hideToolbar = function() {
        $('.mce-toolbar-grp', w.editor.getContainer()).first().hide();
        if (w.layout) {
            w.layout.ui.resizeAll();
        }
    }

    w.getButtonByName = function(name) {
        var buttons = w.editor.buttons,
            toolbarObj = w.editor.theme.panel.find('toolbar *');

        if (buttons[name] === undefined)
            return false;

        var settings = buttons[name], result = false, length = 0;

        tinymce.each(settings, function(v, k) {
            length++;
        });

        tinymce.each(toolbarObj, function(v, k) {
            if (v.type != 'button' || v.settings === undefined)
                return;

            var i = 0;

            tinymce.each(v.settings, function(v, k) {
                if (settings[k] == v)
                    i++;
            });

            if (i != length)
                return;

            result = v;

            return false;
        });

        return result;
    }
    
    w._fireNodeChange = function(nodeEl) {
        // fire the onNodeChange event
        var parents = [];
        w.editor.dom.getParent(nodeEl, function(n) {
            if (n.nodeName == 'BODY')
                return true;

            parents.push(n);
        });
        w.editor.fire('NodeChange', {element: nodeEl, parents: parents});
    };
    
    function _onMouseUpHandler(evt) {
        _hideContextMenus(evt);
        _doHighlightCheck(w.editor, evt);
    };
    
    function _onKeyDownHandler(evt) {
        w.editor.lastKeyPress = evt.which; // store the last key press
        if (w.isReadOnly) {
            evt.preventDefault();
            return;
        }
        // TODO move to keyup
        // redo/undo listener
        if ((evt.which == 89 || evt.which == 90) && evt.ctrlKey) {
            var doUpdate = w.tagger.findNewAndDeletedTags();
            if (doUpdate) {
                w.event('contentChanged').publish(w.editor);
            }
        }
        
        w.event('writerKeydown').publish(evt);
    };
    
    function _onKeyUpHandler(evt) {
        // nav keys and backspace check
        if (evt.which >= 33 || evt.which <= 40 || evt.which == 8) {
            _doHighlightCheck(w.editor, evt);
        }

        // update current entity
        if (w.entitiesManager.getCurrentEntity() !== null) {
            var content = '';
            var entity = w.entitiesManager.getEntity(w.entitiesManager.getCurrentEntity());
            if (entity.getType() === 'note' || entity.getType() === 'citation') {
                // shouldn't actually be here since you can't get "inside" these entities
                content = $($.parseXML(entity.getCustomValues().content)).text();
            } else {
                content = $('.entityHighlight', w.editor.getBody()).text();
            }
            entity.setContent(content);
        }
        
        if (w.emptyTagId) {
            // alphanumeric keys
            if (evt.which >= 48 || evt.which <= 90) {
                var range = w.editor.selection.getRng(true);
                range.setStart(range.commonAncestorContainer, range.startOffset-1);
                range.setEnd(range.commonAncestorContainer, range.startOffset+1);
                w.insertBoundaryTags(w.emptyTagId, w.entitiesManager.getEntity(w.emptyTagId).getType(), range);
                
                // TODO get working in IE
                var tags = $('[name='+w.emptyTagId+']', w.editor.getBody());
                range = w.editor.selection.getRng(true);
                range.setStartAfter(tags[0]);
                range.setEndBefore(tags[1]);
                range.collapse(false);
                
                w.event('entityEdited').publish(w.emptyTagId);
            } else {
                w.entitiesManager.removeEntity(w.emptyTagId);
            }
            w.emptyTagId = null;
        }
        
        if (w.editor.currentNode) {
            // check if the node still exists in the document
            if (w.editor.currentNode.parentNode === null) {
                var rng = w.editor.selection.getRng(true);
                var parent = rng.commonAncestorContainer.parentNode;
                // trying to type inside a bogus node?
                // (this can happen on webkit when typing "over" a selected structure tag)
                if (parent.getAttribute('data-mce-bogus') != null) {
                    var $parent = $(parent);
                    var collapseToStart = true;
                    
                    var newCurrentNode = $parent.nextAll('[_tag]')[0];
                    if (newCurrentNode == null) {
                        newCurrentNode = $parent.parent().nextAll('[_tag]')[0];
                        if (newCurrentNode == null) {
                            collapseToStart = false;
                            newCurrentNode = $parent.prevAll('[_tag]')[0];
                        }
                    }
                    
                    if (newCurrentNode != null) {
                        rng.selectNodeContents(newCurrentNode);
                        rng.collapse(collapseToStart);
                        w.editor.selection.setRng(rng);
                        
                        window.setTimeout(function(){
                            w._fireNodeChange(newCurrentNode);
                        }, 0);
                    }
                }
            }
            
            // check if text is allowed in this node
            if (w.editor.currentNode.getAttribute('_textallowed') == 'false') {
                if (evt.ctrlKey || evt.which == 17) {
                    // don't show message if we got here through undo/redo
                    var node = $('[_textallowed="true"]', w.editor.getBody()).first();
                    var rng = w.editor.selection.getRng(true);
                    rng.selectNodeContents(node[0]);
                    rng.collapse(true);
                    w.editor.selection.setRng(rng);
                } else {
                    w.dialogManager.show('message', {
                        title: 'No Text Allowed',
                        msg: 'Text is not allowed in the current tag: '+w.editor.currentNode.getAttribute('_tag')+'.',
                        type: 'error'
                    });
                    
                    // remove all text
                    $(w.editor.currentNode).contents().filter(function() {
                        return this.nodeType == 3;
                    }).remove();
                }
            }
            
            // replace br's inserted on shift+enter
            if (evt.shiftKey && evt.which == 13) {
                var node = w.editor.currentNode;
                if ($(node).attr('_tag') == 'lb') node = node.parentNode;
                var tagName = w.utilities.getTagForEditor('lb');
                $(node).find('br').replaceWith('<'+tagName+' _tag="lb"></'+tagName+'>');
            }
        }
        
        // delete keys check
        // need to do this here instead of in onchangehandler because that one doesn't update often enough
        if (evt.which == 8 || evt.which == 46) {
            var doUpdate = w.tagger.findNewAndDeletedTags();
            if (doUpdate) {
                w.event('contentChanged').publish(w.editor);
            }
        }
        
        // enter key
        if (evt.which == 13) {
            // find the element inserted by tinymce
            var idCounter = tinymce.DOM.counter-1;
            var newTag = $('#struct_'+idCounter, w.editor.getBody());
            if (newTag.text() == '') {
                newTag.text('\uFEFF'); // insert zero-width non-breaking space so empty tag takes up space
            }
//            if (!w.utilities.isTagBlockLevel(newTag.attr('_tag'))) {
//                w.selectStructureTag(newTag.attr('id'), true);
//            }
        }
        
        w.event('writerKeyup').publish(evt);
    };
    
    function _onChangeHandler(event) {
        if (w.editor.isDirty()) {
            $('br', w.editor.getBody()).remove();
            
            var doUpdate = w.tagger.findNewAndDeletedTags();
            if (doUpdate) {
                // TODO seemingly never getting fired
                w.event('contentChanged').publish(w.editor);
            }
        }
    };
    
    function _onNodeChangeHandler(e) {
        var el = e.element;
        if (el.nodeType != 1) {
            w.editor.currentNode = w.utilities.getRootTag()[0];
        } else {
            if (el.getAttribute('id') == 'mcepastebin') {
                return;
            }
            if (el.getAttribute('_tag') == null && el.classList.contains('entityHighlight') == false) {
                // TODO review is this is still necessary
                if (el.getAttribute('data-mce-bogus') != null) {
                    // artifact from selectStructureTag
                    var sibling;
                    var rng = w.editor.selection.getRng(true);
                    if (rng.collapsed) {
                        // the user's trying to type in a bogus tag
                        // find the closest valid tag and correct the cursor location
                        var backwardDirection = true;
                        if (w.editor.lastKeyPress == 36 || w.editor.lastKeyPress == 37 || w.editor.lastKeyPress == 38) {
                            sibling = $(el).prevAll('[_tag]')[0];
                            backwardDirection = false;
                        } else {
                            sibling = $(el).nextAll('[_tag]')[0];
                            if (sibling == null) {
                                sibling = $(el).parent().nextAll('[_tag]')[0];
                            }
                        }
                        if (sibling != null) {
                            rng.selectNodeContents(sibling);
                            rng.collapse(backwardDirection);
                            w.editor.selection.setRng(rng);
                        }
                    } else {
                        // the structure is selected
                        sibling = $(el).next('[_tag]')[0];
                    }
                    if (sibling != null) {
                        el = sibling;
                    } else {
                        el = el.parentNode;
                    }
                } else if (el == w.editor.getBody()) {
                    return;
                } else {
                    el = el.parentNode;
                }
                
                // use setTimeout to add to the end of the onNodeChange stack
                window.setTimeout(function(){
                    w._fireNodeChange(el);
                }, 0);
            } else {
                w.editor.currentNode = el;
            }
        }
        
        w.editor.currentBookmark = w.editor.selection.getBookmark(1);
        
        w.event('nodeChanged').publish(w.editor.currentNode);
        
        if (w.emptyTagId) {
            w.entitiesManager.removeEntity(w.emptyTagId);
            w.emptyTagId = null;
        }
        
    };
    
    function _onCopyHandler(event) {
        if (w.editor.copiedElement.element != null) {
            $(w.editor.copiedElement.element).remove();
            w.editor.copiedElement.element = null;
        }
        
        w.event('contentCopied').publish();
    };
    
    function _hideContextMenus(evt) {
        var target = $(evt.target);
        // hide structure tree menu
        // TODO move to structure tree
        if ($.vakata && $.vakata.context && target.parents('.vakata-context').length === 0) {
            $.vakata.context.hide();
        }
        // hide editor menu
        if ($('#menu_editor_contextmenu:visible').length > 0 && target.parents('#menu_editor_contextmenu, #menu_structTagsContextMenu, #menu_changeTagContextMenu').length == 0) {
            w.editor.execCommand('hideContextMenu', w.editor, evt);
        }
    };
    
    function _doHighlightCheck(evt) {
        var range = w.editor.selection.getRng(true);
        
        var entityClick = false;
        
        // check if inside boundary tag
        var parent = range.commonAncestorContainer;
        if (parent.nodeType === Node.ELEMENT_NODE && parent.hasAttribute('_entity')) {
            entityClick = true;
            w.entitiesManager.highlightEntity(); // remove highlight
            if ((w.editor.dom.hasClass(parent, 'start') && evt.which == 37) || 
                (w.editor.dom.hasClass(parent, 'end') && evt.which != 39)) {
                var prevNode = w.utilities.getPreviousTextNode(parent);
                range.setStart(prevNode, prevNode.length);
                range.setEnd(prevNode, prevNode.length);
            } else {
                var nextNode = w.utilities.getNextTextNode(parent);
                range.setStart(nextNode, 0);
                range.setEnd(nextNode, 0);
            }
            w.editor.selection.setRng(range);
            range = w.editor.selection.getRng(true);
        }
        
        var entity = $(range.startContainer).parents('[_entity]')[0];
        
//        var entityStart = w.tagger.findEntityBoundary('start', range.startContainer);
//        var entityEnd = w.tagger.findEntityBoundary('end', range.endContainer);
        
        var id, type;
        if (entity != null) {
            id = entity.getAttribute('name');
            type = w.entitiesManager.getEntity(id).getType();
            if (type === 'note' || type === 'citation' || type === 'keyword') {
                // entity marker's clicked so edit the entity
                w.tagger.editTag(id);
            }
        } else {
            w.entitiesManager.highlightEntity();
            var parentNode = $(w.editor.selection.getNode());
            if (parentNode.attr('_tag')) {
                var id = parentNode.attr('id');
                w.editor.currentStruct = id;
            }
            return;
        }
        
        if (id === w.entitiesManager.getCurrentEntity()) return;
        
        w.entitiesManager.highlightEntity(id, w.editor.selection.getBookmark());
    };
    
    
    /**
     * Initialize the editor.
     * @param {String} containerId The ID of the container to transform into the editor.
     */
    w.init = function(containerId) {
        w.eventManager = new EventManager(w);
        // the layoutModules are used by the confi.layout

        w.layoutModules = layoutModules;
        
        var textareaId = 'editor';
        if (config.layout != null) {
            w.layout = new config.layout(w);
            w.layout.init($('#'+containerId), textareaId);
        } else {
            alert('Error: you must specify a layout in the CWRCWriter config!');
            return;
        }
        
        w.schemaManager = new SchemaManager(w, {schemas: config.schemas});
        w.entitiesManager = new EntitiesManager(w);
        w.utilities = new Utilities(w);
        w.tagger = new Tagger(w);
        w.converter = new Converter(w);
        w.fileManager = new FileManager(w);
        w.annotationsManager = new AnnotationsManager(w);
        w.settings = new SettingsDialog(w, {
            showEntityBrackets: true,
            showStructBrackets: false
        });
        
        if (config.storageDialogs != null) {
            w.storageDialogs = config.storageDialogs
        } else {
            alert('Error: you must specify a storage dialogs class in the CWRCWriter config to allow loading and saving documents.');
        }
        if (config.entityLookupDialogs != null) {
            w.entityLookupDialogs = config.entityLookupDialogs;
        } else {
            alert('Error: you must specify entity lookups in the CWRCWriter config for full functionality!');
        }
        if (containerId == null) {
            alert('Error: no ID supplied for CWRCWriter!');
        }
        
        $(document.body).mousedown(function(e) {
            _hideContextMenus(e);
        });
        
        window.addEventListener('beforeunload', function(e) {
            if ((w.isReadOnly === false || w.isAnnotator === true) && window.location.hostname != 'localhost') {
                if (tinymce.get(textareaId).isDirty()) {
                    var msg = 'You have unsaved changes.';
                    (e || window.event).returnValue = msg;
                    return msg;
                }
            }
        });

        $(window).on('unload', function(e) {
            try {
                // clear the editor first (large docs can cause the browser to freeze)
                w.utilities.getRootTag().remove();
            } catch(e) {
                
            }
        });

        /**
         * Init tinymce
         */
        tinymce.baseURL = w.cwrcRootUrl+'/js'; // need for skin
        tinymce.init({
            selector: '#'+textareaId,
            theme: 'modern',
            
            skin: 'lightgray',
            skin_url: '',
            
            content_css: w.cwrcRootUrl+'css/editor.css',
            
            contextmenu_never_use_native: true,
            
            doctype: '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">',
            element_format: 'xhtml',
            
            forced_root_block: w.utilities.getBlockTag(),
            keep_styles: false, // false, otherwise tinymce interprets our spans as style elements
            
            paste_postprocess: function(plugin, ev) {
                function stripTags(index, node) {
                    if (node.hasAttribute('_tag') || node.hasAttribute('_entity') ||
                        node.nodeName.toLowerCase() == 'p' && node.nodeName.toLowerCase() == 'br') {
                        $(node).children().each(stripTags);
                    } else {
                        if ($(node).contents().length == 0) {
                            $(node).remove();
                        } else {
                            var contents = $(node).contents().unwrap();
                            contents.not(':text').each(stripTags);
                        }
                    }
                }
                
                function replaceTags(index, node) {
                    if (node.nodeName.toLowerCase() == 'p') {
                        var tagName = w.utilities.getTagForEditor('p');
                        $(node).contents().unwrap().wrapAll('<'+tagName+' _tag="p"></'+tagName+'>').not(':text').each(replaceTags);
                    } else if (node.nodeName.toLowerCase() == 'br') {
                        var tagName = w.utilities.getTagForEditor('br');
                        $(node).replaceWith('<'+tagName+' _tag="lb"></'+tagName+'>');
                    }
                }
                
                $(ev.node).children().each(stripTags);
                $(ev.node).children().each(replaceTags);
                
                window.setTimeout(function() {
                    // need to fire contentPasted here, after the content is actually within the document
                    w.event('contentPasted').publish();
                }, 0);
            },
            
            valid_elements: '*[*]', // allow everything
            
            plugins: 'schematags,cwrc_contextmenu,cwrcpath', //paste
            toolbar1: config.buttons1 == undefined ? 'schematags,|,addperson,addplace,adddate,addorg,addcitation,addnote,addtitle,addcorrection,addkeyword,addlink,|,editTag,removeTag,|,addtriple,|,viewmarkup,editsource,|,validate,savebutton,loadbutton' : config.buttons1,
            toolbar2: config.buttons2 == undefined ? 'cwrcpath' : config.buttons2,
            toolbar3: config.buttons3 == undefined ? '' : config.buttons3,
            menubar: false,
            elementpath: false,
            statusbar: false,
            
            branding: false,
            
            // disables style keyboard shortcuts
            formats: {
                bold: {},
                italic: {},
                underline: {}
            },
            
            setup: function(ed) {
                // link the writer and editor
                w.editor = ed;
                ed.writer = w;
                
                // custom properties added to the editor
                ed.currentStruct = null; // the id of the currently selected structural tag
                ed.currentBookmark = null; // for storing a bookmark used when adding a tag
                ed.currentNode = null; // the node that the cursor is currently in
                ed.contextMenuPos = null; // the position of the context menu (used to position related dialog box)
                ed.copiedElement = {selectionType: null, element: null}; // the element that was copied (when first selected through the structure tree)
                ed.entityCopy = null; // store a copy of an entity for pasting
                ed.lastKeyPress = null; // the last key the user pressed
                
                if (w.isReadOnly === true) {
                    ed.on('PreInit', function(e) {
                        ed.getBody().removeAttribute('contenteditable');
                    });
                }
                
                ed.on('init', function(args) {
                    // modify isBlock method to check _tag attributes
                    ed.dom.isBlock = function(node) {
                        if (!node) {
                            return false;
                        }
                        
                        var type = node.nodeType;

                        // If it's a node then check the type and use the nodeName
                        if (type) {
                            if (type === 1) {
                                var tag = node.getAttribute('_tag') || node.nodeName;
                                return !!(ed.schema.getBlockElements()[tag]);
                            }
                        }

                        return !!ed.schema.getBlockElements()[node];
                    };
                    
                    var settings = w.settings.getSettings();
                    var body = $(ed.getBody());
                    if (settings.showEntityBrackets) body.addClass('showEntityBrackets');
                    if (settings.showStructBrackets) body.addClass('showStructBrackets');
                    
                    ed.addCommand('isSelectionValid', w.utilities.isSelectionValid);
                    ed.addCommand('addEntity', w.tagger.addEntity);
                    ed.addCommand('editTag', w.tagger.editTag);
                    ed.addCommand('copyTag', w.tagger.copyTag);
                    ed.addCommand('pasteTag', w.tagger.pasteTag);
                    ed.addCommand('changeTag', w.tagger.changeTag);
                    ed.addCommand('splitTag', w.tagger.splitTag);
                    ed.addCommand('removeTag', w.tagger.removeTag);
                    ed.addCommand('pasteEntity', w.tagger.pasteEntity);
                    ed.addCommand('removeEntity', w.tagger.removeEntity);
                    ed.addCommand('addStructureTag', w.tagger.addStructureTag);
                    ed.addCommand('editStructureTag', w.tagger.editStructureTag);
                    ed.addCommand('changeStructureTag', w.changeStructureTag);
                    ed.addCommand('removeHighlights', w.removeHighlights);
                    ed.addCommand('getParentsForTag', w.utilities.getParentsForTag);
                    ed.addCommand('getDocumentationForTag', w.getHelp);
                    
                    // highlight tracking
                    body.on('keydown',_onKeyDownHandler).on('keyup',_onKeyUpHandler);
                    // attach mouseUp to doc because body doesn't always extend to full height of editor panel
                    $(ed.iframeElement.contentDocument).on('mouseup', _onMouseUpHandler);
                    
                    w.isInitialized = true;
                    w.event('writerInitialized').publish(w);
                });
                ed.on('Change',_onChangeHandler);
                ed.on('NodeChange',_onNodeChangeHandler);
                ed.on('copy', _onCopyHandler);
                
                // add schema file and method
                ed.addCommand('getSchema', function(){
                    return w.schemaManager.schema;
                });
                
                ed.addButton('addperson', {title: 'Tag Person', image: w.cwrcRootUrl+'img/user.png',
                    onclick : function() {
                        ed.execCommand('addEntity', 'person');
                    }
                });
                ed.addButton('addplace', {title: 'Tag Place', image: w.cwrcRootUrl+'img/world.png',
                    onclick : function() {
                        ed.execCommand('addEntity', 'place');
                    }
                });
                ed.addButton('adddate', {title: 'Tag Date', image: w.cwrcRootUrl+'img/calendar.png',
                    onclick : function() {
                        ed.execCommand('addEntity', 'date');
                    }
                });
                ed.addButton('addevent', {title: 'Tag Event', image: w.cwrcRootUrl+'img/cake.png',
                    onclick : function() {
                        ed.execCommand('addEntity', 'event');
                    }
                });
                ed.addButton('addorg', {title: 'Tag Organization', image: w.cwrcRootUrl+'img/group.png',
                    onclick : function() {
                        ed.execCommand('addEntity', 'org');
                    }
                });
                ed.addButton('addcitation', {title: 'Tag Citation', image: w.cwrcRootUrl+'img/vcard.png',
                    onclick : function() {
                        ed.execCommand('addEntity', 'citation');
                    }
                });
                ed.addButton('addnote', {title: 'Tag Note', image: w.cwrcRootUrl+'img/note.png',
                    onclick : function() {
                        ed.execCommand('addEntity', 'note');
                    }
                });
                ed.addButton('addcorrection', {title: 'Tag Correction', image: w.cwrcRootUrl+'img/error.png',
                    onclick : function() {
                        ed.execCommand('addEntity', 'correction');
                    }
                });
                ed.addButton('addkeyword', {title: 'Tag Keyword', image: w.cwrcRootUrl+'img/key.png',
                    onclick : function() {
                        ed.execCommand('addEntity', 'keyword');
                    }
                });
                ed.addButton('addlink', {title: 'Tag Link', image: w.cwrcRootUrl+'img/link.png',
                    onclick : function() {
                        ed.execCommand('addEntity', 'link');
                    }
                });
                ed.addButton('addtitle', {title: 'Tag Text/Title', image: w.cwrcRootUrl+'img/book.png',
                    onclick : function() {
                        ed.execCommand('addEntity', 'title');
                    }
                });
                ed.addButton('editTag', {title: 'Edit Tag', image: w.cwrcRootUrl+'img/tag_blue_edit.png',
                    onclick : function() {
                        ed.execCommand('editTag');
                    }
                });
                ed.addButton('removeTag', {title: 'Remove Tag', image: w.cwrcRootUrl+'img/tag_blue_delete.png',
                    onclick : function() {
                        if (w.entitiesManager.getCurrentEntity() != null) {
                            w.tagger.removeEntity(w.entitiesManager.getCurrentEntity(), false);
                        } else if (w.editor.currentStruct != null) {
                            w.tagger.removeStructureTag(w.editor.currentStruct, false);
                        }
                    }
                });
                ed.addButton('newbutton', {title: 'New', image: w.cwrcRootUrl+'img/page_white_text.png',
                    onclick: function() {
                      //  w.fileManager.newDocument();
                      w.storageDialogs.save(w)
                    }
                });
                ed.addButton('savebutton', {title: 'Save', image: w.cwrcRootUrl+'img/save.png',
                    onclick: function() {
                       // w.fileManager.saveDocument();
                       w.storageDialogs.save(w)
                    }
                });
                ed.addButton('saveasbutton', {title: 'Save As', image: w.cwrcRootUrl+'img/save_as.png',
                    onclick: function() {
                        w.dialogManager.show('filemanager', {type: 'saver'});
                    }
                });
                ed.addButton('loadbutton', {title: 'Load', image: w.cwrcRootUrl+'img/folder_page.png',
                    onclick: function() {
                        //w.dialogManager.show('filemanager', {type: 'loader'});
                        w.storageDialogs.load(w)
                    }
                });
                
                ed.addButton('viewmarkup', {title: 'View Markup', image: w.cwrcRootUrl+'img/page_white_code.png',
                    onclick: function() {
                        w.selection.showSelection();
                    }
                });
                
                ed.addButton('editsource', {title: 'Edit Source', image: w.cwrcRootUrl+'img/page_white_edit.png',
                    onclick: function() {
                        w.fileManager.editSource();
                    }
                });
                ed.addButton('validate', {title: 'Validate', image: w.cwrcRootUrl+'img/validate.png',
                    onclick: function() {
                        w.validate();
                    }
                });
                ed.addButton('addtriple', {title: 'Add Relation', image: w.cwrcRootUrl+'img/chart_org.png',
                    onclick: function() {
                        $('#westTabs').tabs('option', 'active', 2);
                        w.dialogManager.show('triple');
                    }
                });
                
                
//                        ed.addButton('toggleeditor', {
//                            title: 'Show Advanced Mode',
//                            image: 'img/html.png',
//                           
//                            cmd: 'toggle_editor'
//                        });
            }
        });
        
        w.dialogManager = new DialogManager(w);

    };
    
    return w;
};

module.exports = CWRCWriter;
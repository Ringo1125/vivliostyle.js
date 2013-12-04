/**
 * Copyright 2013 Google, Inc.
 * @fileoverview Deal with page masters, partition groups, and partitions.
 */
goog.provide('adapt.pm');

goog.require('adapt.base');
goog.require('adapt.expr');
goog.require('adapt.css');
goog.require('adapt.csscasc');
goog.require('adapt.vtree');

/**
 * @type {number}
 */
adapt.pm.keyCount = 1;

/**
 * Represent an at-rule which creates a page-level CSS box (page-master, partition,
 * and partition-group).
 * @param {adapt.expr.LexicalScope} scope
 * @param {?string} name
 * @param {Array.<string>} classes
 * @param {adapt.pm.PageBox} parent
 * @constructor
 */
adapt.pm.PageBox = function(scope, name, pseudoName, classes, parent) {
    // styles specified in the at-rule
    /** @const */ this.specified = /** @type {adapt.csscasc.ElementStyle} */ ({});
    /** @const */ this.children = /** @type {Array.<adapt.pm.PageBox>} */ ([]);
    /** @type {adapt.pm.PageMaster} */ this.pageMaster = null;
    /** @type {number} */ this.index = 0;
    /** @const */ this.scope = scope;
    /** @const */ this.name = name;
    /** @const */ this.pseudoName = pseudoName;
    /** @const */ this.classes = classes;
    /** @const */ this.parent = parent;
    /** @const */ this.key = "p" + (adapt.pm.keyCount++);
    if (parent) {
        this.index = parent.children.length;
        parent.children.push(this);
    }
};

/**
 * @param {adapt.pm.PageBoxInstance} parentInstance
 * @return {adapt.pm.PageBoxInstance}
 */
adapt.pm.PageBox.prototype.createInstance = function(parentInstance) {
	throw new Error("E_UNEXPECTED_CALL");
};

/**
 * Parent of all page masters
 * @param {adapt.expr.LexicalScope} scope
 * @constructor
 * @extends {adapt.pm.PageBox}
 */
adapt.pm.RootPageBox = function(scope) {
    adapt.pm.PageBox.call(this, scope, null, null, [], null);
    this.specified["width"] = new adapt.csscasc.CascadeValue(adapt.css.fullWidth, 0);
    this.specified["height"] = new adapt.csscasc.CascadeValue(adapt.css.fullHeight, 0);
};
goog.inherits(adapt.pm.RootPageBox, adapt.pm.PageBox);


/**
 * @param {adapt.expr.LexicalScope} scope
 * @param {adapt.pm.PageMaster} pageMaster
 */
adapt.pm.makePageMasterScope = function(scope, pageMaster) {
	return new adapt.expr.LexicalScope(scope, 
		/**
		 * @param {string} qualifiedName
		 * @return {adapt.expr.Val}
		 */
		function(qualifiedName, isFunc) {
			var r = qualifiedName.match(/^([^.]+)\.([^.]+)$/);
			if (r) {
				var key = pageMaster.keyMap[r[1]];
				if (key) {
					var holder = /** @type {adapt.pm.InstanceHolder} */ (this);
					var boxInstance = holder.lookupInstance(key);
					if (boxInstance) {
						if (isFunc)
							return boxInstance.resolveFunc(r[2]);
						else
							return boxInstance.resolveName(r[2]);
					}
				}
			}
			return null;
		});
};

/**
 * Represent a page-master rule
 * @param {adapt.expr.LexicalScope} scope
 * @param {?string} name
 * @param {?string} pseudoName
 * @param {Array.<string>} classes
 * @param {adapt.pm.RootPageBox} parent
 * @param {adapt.expr.Val} condition
 * @param {number} specificity
 * @constructor
 * @extends {adapt.pm.PageBox}
 */
adapt.pm.PageMaster = function(scope, name, pseudoName, classes, parent, condition, specificity) {
    adapt.pm.PageBox.call(this, adapt.pm.makePageMasterScope(scope, this), name,
    		pseudoName, classes, parent);
    /** @const */ this.pageMaster = this;
    /** @const */ this.condition = condition;
    /** @const */ this.specificity = specificity;
    this.specified["width"] = new adapt.csscasc.CascadeValue(adapt.css.fullWidth, 0);
    this.specified["height"] = new adapt.csscasc.CascadeValue(adapt.css.fullHeight, 0);
    this.specified["wrap-flow"] =  new adapt.csscasc.CascadeValue(adapt.css.ident.auto, 0);
    /** @type {Object.<string,string>} */ this.keyMap = {};
};
goog.inherits(adapt.pm.PageMaster, adapt.pm.PageBox);

/**
 * @override
 */
adapt.pm.PageMaster.prototype.createInstance = function(parentInstance) {
	return new adapt.pm.PageMasterInstance(parentInstance, this);
};


/**
 * Represent a partition-group rule
 * @param {adapt.expr.LexicalScope} scope
 * @param {?string} name
 * @param {?string} pseudoName
 * @param {Array.<string>} classes
 * @param {adapt.pm.PageBox} parent
 * @constructor
 * @extends {adapt.pm.PageBox}
 */
adapt.pm.PartitionGroup = function(scope, name, pseudoName, classes, parent) {
    adapt.pm.PageBox.call(this, scope, name, pseudoName, classes, parent);
    this.pageMaster = parent.pageMaster;
    if (name) {
    	this.pageMaster.keyMap[name] = this.key;
    }
    this.specified["wrap-flow"] =  new adapt.csscasc.CascadeValue(adapt.css.ident.auto, 0);
};
goog.inherits(adapt.pm.PartitionGroup, adapt.pm.PageBox);

/**
 * @override
 */
adapt.pm.PartitionGroup.prototype.createInstance = function(parentInstance) {
	return new adapt.pm.PartitionGroupInstance(parentInstance, this);
};


/**
 * Represent a partition rule
 * @param {adapt.expr.LexicalScope} scope
 * @param {?string} name
 * @param {?string} pseudoName
 * @param {Array.<string>} classes
 * @param {adapt.pm.PageBox} parent
 * @constructor
 * @extends {adapt.pm.PageBox}
 */
adapt.pm.Partition = function(scope, name, pseudoName, classes, parent) {
    adapt.pm.PageBox.call(this, scope, name, pseudoName, classes, parent);
    this.pageMaster = parent.pageMaster;
    if (name) {
    	this.pageMaster.keyMap[name] = this.key;
    }
};
goog.inherits(adapt.pm.Partition, adapt.pm.PageBox);

/**
 * @override
 */
adapt.pm.Partition.prototype.createInstance = function(parentInstance) {
	return new adapt.pm.PartitionInstance(parentInstance, this);
};

//---------------------------- Instance --------------------------------

/**
 * @param {adapt.expr.LexicalScope} scope
 * @param {adapt.css.Val} val
 * @param {string} def default value
 * @return {adapt.expr.Val}
 */
adapt.pm.toExprIdent = function(scope, val, def) {
    if (!val)
        return new adapt.expr.Const(scope, def);
    return val.toExpr(scope, scope.zero);
};

/**
 * @param {adapt.expr.LexicalScope} scope
 * @param {adapt.css.Val} val
 * @param {adapt.expr.Val} ref
 * @return {adapt.expr.Val}
 */
adapt.pm.toExprAuto = function(scope, val, ref) {
    if (!val || val === adapt.css.ident.auto)
        return null;
    return val.toExpr(scope, ref);
};

/**
 * @param {adapt.expr.LexicalScope} scope
 * @param {adapt.css.Val} val
 * @param {adapt.expr.Val} ref
 * @return {adapt.expr.Val}
 */
adapt.pm.toExprNormal = function(scope, val, ref) {
    if (!val || val === adapt.css.ident.normal)
        return null;
    return val.toExpr(scope, ref);
};

/**
 * @param {adapt.expr.LexicalScope} scope
 * @param {adapt.css.Val} val
 * @param {adapt.expr.Val} ref
 * @return {adapt.expr.Val}
 */
adapt.pm.toExprZero = function(scope, val, ref) {
    if (!val || val === adapt.css.ident.auto)
        return scope.zero;
    return val.toExpr(scope, ref);
};

/**
 * @param {adapt.expr.LexicalScope} scope
 * @param {adapt.css.Val} val
 * @param {adapt.css.Val} styleVal
 * @param {adapt.expr.Val} ref
 * @return {adapt.expr.Val}
 */
adapt.pm.toExprZeroBorder = function(scope, val, styleVal, ref) {
    if (!val || styleVal === adapt.css.ident.none)
        return scope.zero;
    return val.toExpr(scope, ref);
};

/**
 * @param {adapt.expr.LexicalScope} scope
 * @param {adapt.css.Val} val
 * @param {adapt.expr.Val} def
 * @return {adapt.expr.Val}
 */
adapt.pm.toExprBool = function(scope, val, def) {
    if (!val)
        return def;
    if (val === adapt.css.ident._true)
        return scope._true;
    if (val === adapt.css.ident._false)
        return scope._false;
    return val.toExpr(scope, scope.zero);
};

/**
 * @interface
 */
adapt.pm.InstanceHolder = function() {};

/**
 * @param {string} key
 * @param {adapt.pm.PageBoxInstance} instance
 * @return {void}
 */
adapt.pm.InstanceHolder.prototype.registerInstance = function(key, instance) {};

/**
 * @param {string} key
 * @return {adapt.pm.PageBoxInstance} instance
 */
adapt.pm.InstanceHolder.prototype.lookupInstance = function(key) {};

/**
 * @param {adapt.pm.PageBoxInstance} parentInstance
 * @param {adapt.pm.PageBox} pageBox
 * @constructor
 */
adapt.pm.PageBoxInstance = function(parentInstance, pageBox) {
	/** @const */ this.parentInstance = parentInstance;
	/** @const */ this.pageBox = pageBox;
    /**
     * cascaded styles, geometric ones converted to adapt.css.Expr
     * @const
     */
    this.cascaded = /** @type {adapt.csscasc.ElementStyle} */ ({});
    /** @const */ this.style = /** @type {Object.<string,adapt.css.Val>} */ ({});
    /** @type {adapt.expr.Native} */ this.shrinkToFit = null;
    /** @type {adapt.expr.Native} */ this.autoHeight = null;
    /** @type {!Array.<adapt.pm.PageBoxInstance>} */ this.children = [];
    /** @type {boolean} */ this.isShrinkToFit = false;
    /** @type {boolean} */ this.isAutoHeight = false;
    /** @type {boolean} */ this.isTopDependentOnAutoHeight = false;
    /** @type {boolean} */ this.isLeftDependentOnAutoWidth = false;
    /** @type {number} */ this.calculatedWidth = 0;
    /** @type {number} */ this.calculatedHeight = 0;
    /** @type {adapt.pm.PageMasterInstance} */ this.pageMasterInstance = null;
    /** @type {Object.<string,adapt.expr.Val>} */ this.namedValues = {};
    /** @type {Object.<string,adapt.expr.Val>} */ this.namedFuncs = {};
    if (parentInstance) {
    	parentInstance.children.push(this);
    }
};

/**
 * @private
 * @param {string} name1
 * @param {string} name2
 * @return {adapt.expr.Val}
 */
adapt.pm.PageBoxInstance.prototype.addNamedValues = function(name1, name2) {
	var v1 = this.resolveName(name1);
	var v2 = this.resolveName(name2);
	if (!v1 || !v2)
		throw new Error("E_INTERNAL");
	return adapt.expr.add(this.pageBox.scope, v1, v2);	
};

/**
 * @param {string} name
 * @return {adapt.expr.Val}
 */
adapt.pm.PageBoxInstance.prototype.resolveName = function(name) {
	var expr = this.namedValues[name];
	if (expr)
		return expr;
	var val = this.style[name];
	if (val)
		expr = val.toExpr(this.pageBox.scope, this.pageBox.scope.zero);
	switch (name) {
	case "margin-left-edge":
		expr = this.resolveName("left");
		break;
	case "margin-top-edge":
		expr = this.resolveName("top");
		break;
	case "margin-right-edge":
		expr = this.addNamedValues("border-right-edge", "margin-right");
		break;
	case "margin-bottom-edge":
		expr = this.addNamedValues("border-bottom-edge", "margin-bottom");
		break;
	case "border-left-edge":
		expr = this.addNamedValues("margin-left-edge", "margin-left");
		break;
	case "border-top-edge":
		expr = this.addNamedValues("margin-top-edge", "margin-top");
		break;
	case "border-right-edge":
		expr = this.addNamedValues("padding-right-edge", "border-right-width");
		break;
	case "border-bottom-edge":
		expr = this.addNamedValues("padding-bottom-edge", "border-bottom-width");
		break;
	case "padding-left-edge":
		expr = this.addNamedValues("border-left-edge", "border-left-width");
		break;
	case "padding-top-edge":
		expr = this.addNamedValues("border-top-edge", "border-top-width");
		break;
	case "padding-right-edge":
		expr = this.addNamedValues("right-edge", "padding-right");
		break;
	case "padding-bottom-edge":
		expr = this.addNamedValues("bottom-edge", "padding-bottom");
		break;
	case "left-edge":
		expr = this.addNamedValues("padding-left-edge", "padding-left");
		break;
	case "top-edge":
		expr = this.addNamedValues("padding-top-edge", "padding-top");
		break;
	case "right-edge":
		expr = this.addNamedValues("left-edge", "width");
		break;
	case "bottom-edge":
		expr = this.addNamedValues("top-edge", "height");
		break;
	}
	if (expr)
		this.namedValues[name] = expr;
	return expr;
};

adapt.pm.PageBoxInstance.prototype.resolveFunc = function(name) {
	var expr = this.namedFuncs[name];
	if (expr)
		return expr;
	switch (name) {
	case "columns":
		// min(count,column-count) * (column-width + column-gap) - column-gap
		var scope = this.pageBox.scope;
		var count = new adapt.expr.Param(scope, 0);
		var columnCount = this.resolveName("column-count");
		var columnWidth = this.resolveName("column-width");
		var columnGap = this.resolveName("column-gap");
		expr = adapt.expr.sub(scope, adapt.expr.mul(scope,
				new adapt.expr.Call(scope, "min", [count, columnCount]),
				adapt.expr.add(scope, columnWidth, columnGap)), columnGap);	
		break;
	}
	if (expr)
		this.namedFuncs[name] = expr;
	return expr;
};

/**
 * @private
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.initEnabled = function() {
    var scope = this.pageBox.scope;
    var style = this.style;
    var enabled = adapt.pm.toExprBool(scope, style["enabled"], scope._true);
    var page = adapt.pm.toExprAuto(scope, style["page"], scope.zero);
    if (page) {
        var currentPage = new adapt.expr.Named(scope, "page-number");
        enabled = adapt.expr.and(scope, enabled, new adapt.expr.Eq(scope, page, currentPage));
    }
    var minPageWidth = adapt.pm.toExprAuto(scope, style["min-page-width"], scope.zero);
    if (minPageWidth) {
    	enabled = adapt.expr.and(scope, enabled, 
    			new adapt.expr.Ge(scope, new adapt.expr.Named(scope, "page-width"), minPageWidth));
    }
    var minPageHeight = adapt.pm.toExprAuto(scope, style["min-page-height"], scope.zero);
    if (minPageHeight) {
    	enabled = adapt.expr.and(scope, enabled, 
    			new adapt.expr.Ge(scope, new adapt.expr.Named(scope, "page-height"), minPageHeight));
    }
    enabled = this.boxSpecificEnabled(enabled);
    style["enabled"] = new adapt.css.Expr(enabled);
};

/**
 * @private
 * @param {adapt.expr.Val} enabled
 * @return {adapt.expr.Val}
 */
adapt.pm.PageBoxInstance.prototype.boxSpecificEnabled = function(enabled) {
	return enabled;
};

/**
 * @private
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.initHorizontal = function() {
    var scope = this.pageBox.scope;
    var style = this.style;
    var parentWidth = this.parentInstance ? 
    		this.parentInstance.style["width"].toExpr(scope, null) : null;
    var left = adapt.pm.toExprAuto(scope, style["left"], parentWidth);
    var marginLeft = adapt.pm.toExprAuto(scope, style["margin-left"], parentWidth);
    var borderLeftWidth = adapt.pm.toExprZeroBorder(scope, style["border-left-width"], style["border-left-style"], parentWidth);
    var paddingLeft = adapt.pm.toExprZero(scope, style["padding-left"], parentWidth);
    var width = adapt.pm.toExprAuto(scope, style["width"], parentWidth);
    var maxWidth = adapt.pm.toExprAuto(scope, style["max-width"], parentWidth);
    var paddingRight = adapt.pm.toExprZero(scope, style["padding-right"], parentWidth);
    var borderRightWidth = adapt.pm.toExprZeroBorder(scope, style["border-right-width"], style["border-right-style"], parentWidth);
    var marginRight = adapt.pm.toExprAuto(scope, style["margin-right"], parentWidth);
    var right = adapt.pm.toExprAuto(scope, style["right"], parentWidth);
    var leftBP = adapt.expr.add(scope, borderLeftWidth, paddingLeft);
    var rightBP = adapt.expr.add(scope, borderLeftWidth, paddingLeft);
    if (left && right && width) {
        var extra = adapt.expr.sub(scope, parentWidth, adapt.expr.add(scope, width,
        		adapt.expr.add(scope, adapt.expr.add(scope, left, leftBP), rightBP)));
        if (!marginLeft) {
            extra = adapt.expr.sub(scope, extra, right);
            if (!marginRight) {
                marginLeft = adapt.expr.mul(scope, extra, new adapt.expr.Const(scope, 0.5));
                marginRight = marginLeft;
            } else {
                marginLeft = adapt.expr.sub(scope, extra, marginRight);
            }
        } else {
            if (!marginRight) {
                marginRight = adapt.expr.sub(scope, extra, adapt.expr.add(scope, right, marginLeft));
            } else {
                // overconstraint
                right = adapt.expr.sub(scope, extra, marginRight);
            }
        }
    } else {
        if (!marginLeft)
            marginLeft = scope.zero;
        if (!marginRight)
            marginRight = scope.zero;
        if (!left && !right && !width)
            left = scope.zero;
        if (!left && !width) {
            width = this.shrinkToFit;
            this.isShrinkToFit = true;
        } else if (!left && !right) {
            left = scope.zero;
        } else if (!width && !right) {
            width = this.shrinkToFit;
            this.isShrinkToFit = true;
        }
        var remains = adapt.expr.sub(scope, parentWidth, 
        		adapt.expr.add(scope, adapt.expr.add(scope, marginLeft, leftBP),
        				adapt.expr.add(scope, marginRight, rightBP)));
        if (this.isShrinkToFit) {
            if (!maxWidth) {
                // TODO: handle the case when right/left depends on width
                maxWidth = adapt.expr.sub(scope, remains, (left ? left : right));
            }
            // For multi-column layout, width is max-width.
            if (adapt.pm.toExprAuto(scope, style["column-width"], null) || 
            		adapt.pm.toExprAuto(scope, style["column-count"], null)) {
                width = maxWidth;
                this.isShrinkToFit = false;
            }
        }
        if (!left) {
            left = adapt.expr.sub(scope, remains, adapt.expr.add(scope, right, width));
        } else if (!width) {
            width = adapt.expr.sub(scope, remains, adapt.expr.add(scope, left, right));
        } else if (!right) {
            right = adapt.expr.sub(scope, remains, adapt.expr.add(scope, left, width));
        }
    }
    var snapWidth = adapt.pm.toExprZero(scope, style["snap-width"], parentWidth);
    style["left"] = new adapt.css.Expr(left);
    style["margin-left"] = new adapt.css.Expr(marginLeft);
    style["border-left-width"] = new adapt.css.Expr(borderLeftWidth);
    style["padding-left"] = new adapt.css.Expr(paddingLeft);
    style["width"] = new adapt.css.Expr(width);
    style["max-width"] = new adapt.css.Expr(maxWidth ? maxWidth : width);
    style["padding-right"] = new adapt.css.Expr(paddingRight);
    style["border-right-width"] = new adapt.css.Expr(borderRightWidth);
    style["margin-right"] = new adapt.css.Expr(marginRight);
    style["right"] = new adapt.css.Expr(right);
    style["snap-width"] = new adapt.css.Expr(snapWidth);
};

/**
 * @private
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.initVertical = function() {
    var scope = this.pageBox.scope;
    var style = this.style;
    var parentWidth = this.parentInstance ? 
    		this.parentInstance.style["width"].toExpr(scope, null) : null;
    var parentHeight = this.parentInstance ? 
    		this.parentInstance.style["height"].toExpr(scope, null) : null;
    var top = adapt.pm.toExprAuto(scope, style["top"], parentHeight);
    var marginTop = adapt.pm.toExprAuto(scope, style["margin-top"], parentWidth);
    var borderTopWidth = adapt.pm.toExprZeroBorder(scope, style["border-top-width"], style["border-top-style"], parentWidth);
    var paddingTop = adapt.pm.toExprZero(scope, style["padding-top"], parentWidth);
    var height = adapt.pm.toExprAuto(scope, style["height"], parentHeight);
    var maxHeight = adapt.pm.toExprAuto(scope, style["max-height"], parentHeight);
    var paddingBottom = adapt.pm.toExprZero(scope, style["padding-bottom"], parentWidth);
    var borderBottomWidth = adapt.pm.toExprZeroBorder(scope, style["border-bottom-width"], style["border-bottom-style"], parentWidth);
    var marginBottom = adapt.pm.toExprAuto(scope, style["margin-bottom"], parentWidth);
    var bottom = adapt.pm.toExprAuto(scope, style["bottom"], parentHeight);
    var topBP = adapt.expr.add(scope, borderTopWidth, paddingTop);
    var bottomBP = adapt.expr.add(scope, borderBottomWidth, paddingBottom);
    if (top && bottom && height) {
        var extra = adapt.expr.sub(scope, parentHeight, 
        		adapt.expr.add(scope, height, adapt.expr.add(scope, 
        				adapt.expr.add(scope, top, topBP), bottomBP)));
        if (!marginTop) {
            extra = adapt.expr.sub(scope, extra, bottom);
            if (!marginBottom) {
                marginTop = adapt.expr.mul(scope, extra, new adapt.expr.Const(scope, 0.5));
                marginBottom = marginTop;
            } else {
                marginTop = adapt.expr.sub(scope, extra, marginBottom);
            }
        } else {
            if (!marginBottom) {
                marginBottom = adapt.expr.sub(scope, extra, 
                		adapt.expr.add(scope, bottom, marginTop));
            } else {
                // overconstraint
                bottom = adapt.expr.sub(scope, extra, marginTop);
            }
        }
    } else {
        if (!marginTop)
            marginTop = scope.zero;
        if (!marginBottom)
            marginBottom = scope.zero;
        if (!top && !bottom && !height)
            top = scope.zero;
        if (!top && !height) {
            height = this.autoHeight;
            this.isAutoHeight = true;
        } else if (!top && !bottom) {
            top = scope.zero;
        } else if (!height && !bottom) {
            height = this.autoHeight;
            this.isAutoHeight = true;
        }
        var remains = adapt.expr.sub(scope, parentHeight, 
        		adapt.expr.add(scope, adapt.expr.add(scope, marginTop, topBP), 
        				adapt.expr.add(scope, marginBottom, bottomBP)));
        if (this.isAutoHeight && !maxHeight) {
            // TODO: handle the case when top/bottom depends on height
            maxHeight = adapt.expr.sub(scope, remains, (top ? top : bottom));
        }
        if (!top) {
            top = adapt.expr.sub(scope, remains, adapt.expr.add(scope, bottom, height));
        } else if (!height) {
            height = adapt.expr.sub(scope, remains, adapt.expr.add(scope, bottom, top));
        } else if (!bottom) {
            bottom = adapt.expr.sub(scope, remains, adapt.expr.add(scope, top, height));
        }
    }
    var snapHeight = adapt.pm.toExprZero(scope, style["snap-height"], parentWidth);
    style["top"] = new adapt.css.Expr(top);
    style["margin-top"] = new adapt.css.Expr(marginTop);
    style["border-top-width"] = new adapt.css.Expr(borderTopWidth);
    style["padding-top"] = new adapt.css.Expr(paddingTop);
    style["height"] = new adapt.css.Expr(height);
    style["max-height"] = new adapt.css.Expr(maxHeight ? maxHeight : height);
    style["padding-bottom"] = new adapt.css.Expr(paddingBottom);
    style["border-bottom-width"] = new adapt.css.Expr(borderBottomWidth);
    style["margin-bottom"] = new adapt.css.Expr(marginBottom);
    style["bottom"] = new adapt.css.Expr(bottom);
    style["snap-height"] = new adapt.css.Expr(snapHeight);
};

/**
 * @private
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.initColumns = function() {
    var scope = this.pageBox.scope;
    var style = this.style;
    var width = adapt.pm.toExprAuto(scope, style["width"], null);
    var columnWidth = adapt.pm.toExprAuto(scope, style["column-width"], width);
    var columnCount = adapt.pm.toExprAuto(scope, style["column-count"], null);
    var columnGap = adapt.pm.toExprNormal(scope, style["column-gap"], null);
    if (!columnGap)
        columnGap = new adapt.expr.Numeric(scope, 1, "em");
    if (columnWidth && !columnCount) {
        columnCount = new adapt.expr.Call(scope, "floor", [adapt.expr.div(scope, 
        		adapt.expr.add(scope, width, columnGap), adapt.expr.add(scope, columnWidth, columnGap))]);
        columnCount = new adapt.expr.Call(scope, "max", [scope.one, columnCount]);
    }
    if (!columnCount)
        columnCount = scope.one;
    columnWidth = adapt.expr.sub(scope, adapt.expr.div(scope, 
    		adapt.expr.add(scope, width, columnGap), columnCount), columnGap);
    style["column-width"] = new adapt.css.Expr(columnWidth);
    style["column-count"] = new adapt.css.Expr(columnCount);
    style["column-gap"] = new adapt.css.Expr(columnGap);
};

/**
 * @private
 * @param {string} propName
 * @param {adapt.expr.Val} val
 * @param {adapt.expr.Context} context
 * @return {boolean}
 */
adapt.pm.PageBoxInstance.prototype.depends = function(propName, val, context) {
    return this.style[propName].toExpr(this.pageBox.scope, null).depend(val, context);
};

/**
 * @private
 * @param {adapt.expr.Context} context
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.init = function(context) {
	// If context does not implement InstanceHolder we would not be able to resolve
	// "partition.property" names later.
	var holder = /** @type {adapt.pm.InstanceHolder} */ (context);
	holder.registerInstance(this.pageBox.key, this);
    var scope = this.pageBox.scope;
    var cascaded = this.cascaded;
    var style = this.style;
    for (var propName in cascaded) {
        if (adapt.csscasc.isPropName(propName)) {
	        var propVal = adapt.csscasc.getProp(cascaded, propName);
	        if (propVal) {
	            style[propName] = propVal.value;
	        }
        }
    }
    var self = this;
    this.shrinkToFit = new adapt.expr.Native(scope, 
    		function() { 
    			return self.calculatedWidth;
    		}, "shrinkToFit");
    this.autoHeight = new adapt.expr.Native(scope, 
    		function() {
    			return self.calculatedHeight;
    		}, "autoHeight");
    this.initHorizontal();
    this.initVertical();
    this.initColumns();
    this.initEnabled();
    // all implicit dependencies are set up at this point
    if (this.isShrinkToFit) {
        this.isLeftDependentOnAutoWidth = this.depends("left", this.shrinkToFit, context) ||
            this.depends("margin-left", this.shrinkToFit, context) ||
            this.depends("border-left-width", this.shrinkToFit, context) ||
            this.depends("padding-left", this.shrinkToFit, context);
    }
    if (this.isAutoHeight) {
        this.isTopDependentOnAutoHeight = this.depends("top", this.autoHeight, context) ||
            this.depends("margin-top", this.autoHeight, context) ||
            this.depends("border-top-width", this.autoHeight, context) ||
            this.depends("padding-top", this.autoHeight, context);
    }
};

/**
 * @param {adapt.expr.Context} context
 * @param {string} name
 * @return {adapt.css.Val}
 */
adapt.pm.PageBoxInstance.prototype.getProp = function(context, name) {
    var val = this.style[name];
    if (val) {
        val = adapt.cssparse.evaluateCSSToCSS(context, val, name);
    }
    return val;
};

/**
 * @param {adapt.expr.Context} context
 * @param {string} name
 * @return {number}
 */
adapt.pm.PageBoxInstance.prototype.getPropAsNumber = function(context, name) {
    var val = this.style[name];
    if (val) {
        val = adapt.cssparse.evaluateCSSToCSS(context, val, name);
    }
    return adapt.css.toNumber(val, context);
};

/**
 * @param {adapt.expr.Context} context
 * @param {string} name
 * @return {Array.<adapt.css.Val>}
 */
adapt.pm.PageBoxInstance.prototype.getSpecial = function(context, name) {
    var arr = adapt.csscasc.getSpecial(this.cascaded, name);
    if (arr) {
        var result = /** @type {Array.<adapt.css.Val>} */ ([]);
        for (var i = 0; i < arr.length; i++) {
            var v = arr[i].evaluate(context, "");
            if (v && v !== adapt.css.empty)
                result.push(v);
        }
        if (result.length)
            return result;
    }
    return null;
};

/**
 * @param {adapt.expr.Context} context
 * @return {Array.<string>}
 */
adapt.pm.PageBoxInstance.prototype.getActiveRegions = function(context) {
    var arr = this.getSpecial(context, "region-id");
    if (arr) {
        var result = /** @type {Array.<string>} */ ([]);
        for (var i = 0; i < arr.length; i++) {
            result[i] = arr[i].toString();
        }
        return result;
    }
    return null;
};

/**
 * @param {adapt.expr.Context} context
 * @param {adapt.vtree.Container} container
 * @param {string} name
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.propagateProperty = function(context, container, name) {
    var val = this.getProp(context, name);
    if (val)
        adapt.base.setCSSProperty(container.element, name, val.toString());
};

/**
 * @param {adapt.expr.Context} context
 * @param {adapt.vtree.Container} container
 * @param {string} name
 * @param {Array.<adapt.vtree.DelayedItem>} delayedItems
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.propagateDelayedProperty = function(context, container, name, delayedItems) {
    var val = this.getProp(context, name);
    if (val)
        delayedItems.push(new adapt.vtree.DelayedItem(container.element, name, val));
};

/**
 * @param {adapt.expr.Context} context
 * @param {adapt.vtree.Container} container
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.assignTopPosition = function(context, container) {
	var snapHeight = this.getPropAsNumber(context, "snap-height");
    var top = this.getPropAsNumber(context, "top");
    var marginTop = this.getPropAsNumber(context, "margin-top");
    var paddingTop = this.getPropAsNumber(context, "padding-top");
    var borderTopWidth = this.getPropAsNumber(context, "border-top-width");
    container.top = top;
    container.marginTop = marginTop;
    container.borderTop = borderTopWidth;
    container.snapHeight = snapHeight;
    if (snapHeight > 0) {
    	var ypos = top + container.getInsetTop();
    	var r = ypos - Math.floor(ypos / snapHeight) * snapHeight;
    	if (r > 0) {
    		container.snapOffsetY = snapHeight - r;
    		paddingTop += container.snapOffsetY;
    	}
    }
	container.paddingTop = paddingTop;
    adapt.base.setCSSProperty(container.element, "top", top + "px");
    adapt.base.setCSSProperty(container.element, "margin-top", marginTop + "px");
    adapt.base.setCSSProperty(container.element, "padding-top", paddingTop + "px");
    adapt.base.setCSSProperty(container.element, "border-top-width", borderTopWidth + "px");
};

/**
 * @param {adapt.expr.Context} context
 * @param {adapt.vtree.Container} container
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.assignBottomPosition = function(context, container) {
    var marginBottom = this.getPropAsNumber(context, "margin-bottom");
    var paddingBottom = this.getPropAsNumber(context, "padding-bottom");
    var borderBottomWidth = this.getPropAsNumber(context, "border-bottom-width");
    var height = this.getPropAsNumber(context, "height") - container.snapOffsetY;
    adapt.base.setCSSProperty(container.element, "height", height + "px");
    adapt.base.setCSSProperty(container.element, "margin-bottom", marginBottom + "px");
    adapt.base.setCSSProperty(container.element, "padding-bottom", paddingBottom + "px");
    adapt.base.setCSSProperty(container.element, "border-bottom-width", borderBottomWidth + "px");
    container.height = height - container.snapOffsetY;
    container.marginBottom = marginBottom;
    container.borderBottom = borderBottomWidth;
    container.paddingBottom = paddingBottom;
};

/**
 * @param {adapt.expr.Context} context
 * @param {adapt.vtree.Container} container
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.assignHorizontalPosition = function(context, container) {
    var left = this.getPropAsNumber(context, "left");
    var marginLeft = this.getPropAsNumber(context, "margin-left");
    var marginRight = this.getPropAsNumber(context, "margin-right");
    var paddingLeft = this.getPropAsNumber(context, "padding-left");
    var paddingRight = this.getPropAsNumber(context, "padding-right");
    var borderLeftWidth = this.getPropAsNumber(context, "border-left-width");
    var borderRightWidth = this.getPropAsNumber(context, "border-right-width");
    var width = this.getPropAsNumber(context, "width");
    container.setHorizontalPosition(left, width);
    adapt.base.setCSSProperty(container.element, "margin-left", marginLeft + "px");
    adapt.base.setCSSProperty(container.element, "margin-right", marginRight + "px");
    adapt.base.setCSSProperty(container.element, "padding-left", paddingLeft + "px");
    adapt.base.setCSSProperty(container.element, "padding-right", paddingRight + "px");
    adapt.base.setCSSProperty(container.element, "border-left-width", borderLeftWidth + "px");
    adapt.base.setCSSProperty(container.element, "border-right-width", borderRightWidth + "px");
    container.marginLeft = marginLeft;
    container.borderLeft = borderLeftWidth;
    container.paddingLeft = paddingLeft;
    container.marginRight = marginRight;
    container.borderRight = borderRightWidth;
    container.paddingRight = paddingRight;
    container.snapWidth = this.getPropAsNumber(context, "snap-width");
};

/**
 * @param {adapt.expr.Context} context
 * @param {adapt.vtree.Container} container
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.sizeWithMaxHeight = function(context, container) {
    adapt.base.setCSSProperty(container.element, "border-top-width", "0px");
    var height = this.getPropAsNumber(context, "max-height");
    if (!this.isTopDependentOnAutoHeight) {
        this.assignTopPosition(context, container);
        height -= container.snapOffsetY;
        container.height = height;
        adapt.base.setCSSProperty(container.element, "height", height + "px");
    } else {
        container.setVerticalPosition(0, height);
	}
};

/**
 * @param {adapt.expr.Context} context
 * @param {adapt.vtree.Container} container
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.sizeWithMaxWidth = function(context, container) {
    // TODO: calculate left position if possible
    adapt.base.setCSSProperty(container.element, "border-left-width", "0px");
    var width = this.getPropAsNumber(context, "max-width");
    container.setHorizontalPosition(0, width);
};

/**
 * @const
 */
adapt.pm.passProperties = [
	"border-left-style",
	"border-right-style",
	"border-top-style",
	"border-bottom-style",
	"border-left-color",
	"border-right-color",
	"border-top-color",
	"border-bottom-color",
	"border-top-left-radius",
	"border-top-right-radius",
	"border-bottom-right-radius",
	"border-bottom-left-radius",
	"border-image-source",
	"border-image-slice",
	"border-image-width",
	"border-image-outset",
	"border-image-repeat",
	"background-attachment",
	"background-color",
	"background-image",
	"background-repeat",
	"background-position",
	"background-clip",
	"background-origin",
	"background-size",
	"opacity",
	"overflow",
	"z-index"
];

/**
 * Only passed when there is content assigned by the content property.
 * @const
 */
adapt.pm.passContentProperties = [
    "color",
    "font-family",
    "font-size",
    "font-style",
    "font-weight"
];

/**
 * @const
 */
adapt.pm.delayedProperties = [
	"transform",
	"transform-origin"
];

/**
 * @param {adapt.expr.Context} context
 * @param {adapt.vtree.Container} container
 * @param {adapt.vtree.Page} page
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.prepareContainer = function(context, container, page) {
    if (this.isAutoHeight) {
        this.sizeWithMaxHeight(context, container);
    } else {
        this.assignTopPosition(context, container);
        this.assignBottomPosition(context, container);
    }
    if (this.isShrinkToFit)
        this.sizeWithMaxWidth(context, container);
    else
        this.assignHorizontalPosition(context, container);
    for (var i = 0; i < adapt.pm.passProperties.length; i++) {
        this.propagateProperty(context, container, adapt.pm.passProperties[i]);    	
    }
    for (var i = 0; i < adapt.pm.delayedProperties.length; i++) {
        this.propagateDelayedProperty(context, container, adapt.pm.delayedProperties[i], page.delayedItems);    	
    }
};

/**
 * @param {adapt.expr.Context} context
 * @param {adapt.vtree.Container} container
 * @param {adapt.vtree.Page} page
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.transferContentProps = function(context, container, page) {
    for (var i = 0; i < adapt.pm.passContentProperties.length; i++) {
        this.propagateProperty(context, container, adapt.pm.passContentProperties[i]);    	
    }
};

/**
 * @param {adapt.expr.Context} context
 * @param {adapt.vtree.Container} container
 * @param {adapt.vtree.Container} column (null when content comes from the content property)
 * @param {number} columnCount
 * @param {adapt.vtree.ClientLayout} clientLayout
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.finishContainer = function(
		context, container, column, columnCount, clientLayout) {
    this.calculatedHeight = container.computedHeight + container.snapOffsetY;
    var readHeight = !column && this.isAutoHeight;
    var readWidth = this.isShrinkToFit;
    var bbox = null;
    if (readWidth || readHeight) {
    	if (readWidth) {
    		adapt.base.setCSSProperty(container.element, "width", "auto");
    	}
    	if (readHeight) {
    		adapt.base.setCSSProperty(container.element, "height", "auto");
    	}
        bbox = clientLayout.getElementClientRect(column ? column.element : container.element);
        if (readWidth) {
        	this.calculatedWidth = bbox.right - bbox.left
        		- container.paddingLeft - container.borderLeft
        		- container.paddingRight - container.borderRight;
        }
        if (readHeight) {
        	container.computedHeight = bbox.bottom - bbox.top 
        		- container.paddingTop - container.borderTop
        		- container.paddingBottom - container.borderBottom;
        	this.calculatedHeight = container.computedHeight + container.snapOffsetY;
        }
    }
    if (this.isShrinkToFit) {
    	this.assignHorizontalPosition(context, container);    	
    }
    if (this.isAutoHeight) {
        if (this.isTopDependentOnAutoHeight)
            this.assignTopPosition(context, container);
        this.assignBottomPosition(context, container);
    }
    if (columnCount > 1) {
    	var ruleWidth = this.getPropAsNumber(context, "column-rule-width");
    	var ruleStyle = this.getProp(context, "column-rule-style");
    	var ruleColor = this.getProp(context, "column-rule-color");
    	if (ruleWidth > 0 && ruleStyle && ruleStyle != adapt.css.ident.none &&
    			ruleColor != adapt.css.ident.transparent) {
        	var columnGap = this.getPropAsNumber(context, "column-gap");
    		for (var i = 1; i < columnCount; i++) {
    			var pos = (container.width + columnGap) * i / columnCount - columnGap/2
    				+ container.paddingLeft - ruleWidth/2;
    			var size = container.height + container.paddingTop + container.paddingBottom;
    			var rule = container.element.ownerDocument.createElement("div");
    			adapt.base.setCSSProperty(rule, "position", "absolute");
    			adapt.base.setCSSProperty(rule, "top", "0px");
    			adapt.base.setCSSProperty(rule, "left", pos + "px");
    			adapt.base.setCSSProperty(rule, "width", "0px");
    			adapt.base.setCSSProperty(rule, "height", size + "px");
    			adapt.base.setCSSProperty(rule, "border-left-width", ruleWidth + "px");
    			adapt.base.setCSSProperty(rule, "border-left-style", ruleStyle.toString());
    			if (ruleColor) {
    				adapt.base.setCSSProperty(rule, "border-left-color", ruleColor.toString());
    			}
    			container.element.insertBefore(rule, container.element.firstChild);
    		}
    	}
    }
};

/**
 * @param {adapt.csscasc.CascadeInstance} cascade
 * @param {adapt.csscasc.ElementStyle} docElementStyle
 * @return {void}
 */
adapt.pm.PageBoxInstance.prototype.applyCascadeAndInit = function(cascade, docElementStyle) {
	var style = this.cascaded;
	var specified = this.pageBox.specified;
	for (var name in specified) {
		if (adapt.csscasc.isPropName(name)) {
			adapt.csscasc.setProp(style, name, adapt.csscasc.getProp(specified, name));
		}
	}
	if (this.pageBox.pseudoName == "background-host") {
		for (var name in docElementStyle) {
			if (name.match(/^background-/)) {
				style[name] = docElementStyle[name];
			}
		}
	}
	if (this.pageBox.pseudoName == "layout-host") {
		for (var name in docElementStyle) {
			if (!name.match(/^background-/)) {
				style[name] = docElementStyle[name];
			}
		}
	}
	cascade.pushRule(this.pageBox.classes, style);
	this.init(cascade.context);
	for (var i = 0; i < this.pageBox.children.length ; i++) {
		var child = this.pageBox.children[i];
		var childInstance = child.createInstance(this);
	    childInstance.applyCascadeAndInit(cascade, docElementStyle);
	}
	cascade.popRule();
};


/**
 * @param {adapt.pm.RootPageBox} pageBox
 * @constructor
 * @extends {adapt.pm.PageBoxInstance}
 */
adapt.pm.RootPageBoxInstance = function(pageBox) {
	adapt.pm.PageBoxInstance.call(this, null, pageBox);
};
goog.inherits(adapt.pm.RootPageBoxInstance, adapt.pm.PageBoxInstance);

/**
 * @override
 */
adapt.pm.RootPageBoxInstance.prototype.applyCascadeAndInit = function(cascade, docElementStyle) {
	adapt.pm.PageBoxInstance.prototype.applyCascadeAndInit.call(this, cascade, docElementStyle);
	// Sort page masters using order and specificity.
    var pageMasters = this.children;
    (/** @type {Array.<adapt.pm.PageMasterInstance>} */ (pageMasters)).sort(
    	/**
    	 * @param {adapt.pm.PageMasterInstance} a
    	 * @param {adapt.pm.PageMasterInstance} b
    	 * @return {number}
    	 */
    	function (a, b) { 
    		return b.pageBox.specificity - a.pageBox.specificity || a.pageBox.index - b.pageBox.index;
    	}
    );	
};

/**
 * @param {adapt.pm.PageBoxInstance} parentInstance
 * @param {adapt.pm.PageBox} pageBox
 * @constructor
 * @extends {adapt.pm.PageBoxInstance}
 */
adapt.pm.PageMasterInstance = function(parentInstance, pageBox) {
	adapt.pm.PageBoxInstance.call(this, parentInstance, pageBox);
	this.pageMasterInstance = this;
};
goog.inherits(adapt.pm.PageMasterInstance, adapt.pm.PageBoxInstance);

/**
 * @override
 */
adapt.pm.PageMasterInstance.prototype.boxSpecificEnabled = function(enabled) {
	var pageMaster = this.pageBox.pageMaster;
    if (pageMaster.condition) {
        enabled = adapt.expr.and(pageMaster.scope, enabled, pageMaster.condition);
    }
    return enabled;
};

/**
 * @param {adapt.pm.PageBoxInstance} parentInstance
 * @param {adapt.pm.PageBox} pageBox
 * @constructor
 * @extends {adapt.pm.PageBoxInstance}
 */
adapt.pm.PartitionGroupInstance = function(parentInstance, pageBox) {
	adapt.pm.PageBoxInstance.call(this, parentInstance, pageBox);
	this.pageMasterInstance = parentInstance.pageMasterInstance;
};
goog.inherits(adapt.pm.PartitionGroupInstance, adapt.pm.PageBoxInstance);


/**
 * @param {adapt.pm.PageBoxInstance} parentInstance
 * @param {adapt.pm.PageBox} pageBox
 * @constructor
 * @extends {adapt.pm.PageBoxInstance}
 */
adapt.pm.PartitionInstance = function(parentInstance, pageBox) {
	adapt.pm.PageBoxInstance.call(this, parentInstance, pageBox);
	this.pageMasterInstance = parentInstance.pageMasterInstance;
};
goog.inherits(adapt.pm.PartitionInstance, adapt.pm.PageBoxInstance);

/**
 * @param {adapt.expr.Val} enabled
 * @param {adapt.css.Val} listVal
 * @param {boolean} conflicting
 * @return {adapt.expr.Val}
 */
adapt.pm.PartitionInstance.prototype.processPartitionList = function(enabled, listVal, conflicting) {
	var list = null;
	if (listVal instanceof adapt.css.Ident) {
		list = [listVal];
	}
    if (listVal instanceof adapt.css.CommaList) {
    	list = (/** @type {adapt.css.CommaList} */ (listVal)).values;
    }
	if (list) {
    	var scope = this.pageBox.scope;
    	for (var i = 0; i < list.length; i++) {
    		if (list[i] instanceof adapt.css.Ident) {
    			var qname = adapt.expr.makeQualifiedName(
    					(/** @type {adapt.css.Ident} */ (list[i])).name, "enabled");
    			var term = new adapt.expr.Named(scope, qname);
    			if (conflicting) {
    				term = new adapt.expr.Not(scope, term);
    			}
    			enabled = adapt.expr.and(scope, enabled, term);
    		}
    	}
    }
    return enabled;
};

/**
 * @override
 */
adapt.pm.PartitionInstance.prototype.boxSpecificEnabled = function(enabled) {
	var scope = this.pageBox.scope;
	var style = this.style;
	var required = adapt.pm.toExprBool(scope, style["required"], scope._false) !== scope._false;
    if (required || this.isAutoHeight) {
        var flowName = adapt.pm.toExprIdent(scope, style["flow-from"], "body");
    	var hasContent = new adapt.expr.Call(scope, "has-content", [flowName]);
        enabled = adapt.expr.and(scope, enabled, hasContent);
    }
    enabled = this.processPartitionList(enabled, style["required-partitions"], false);
    enabled = this.processPartitionList(enabled, style["conflicting-partitions"], true);
    if (required) {
        var pmEnabledVal = this.pageMasterInstance.style["enabled"];
        var pmEnabled = pmEnabledVal ? pmEnabledVal.toExpr(scope, null) : scope._true;
        pmEnabled = adapt.expr.and(scope, pmEnabled, enabled);
        this.pageMasterInstance.style["enabled"] = new adapt.css.Expr(pmEnabled);
    }
    return enabled;
};

/**
 * @override
 */
adapt.pm.PartitionInstance.prototype.prepareContainer = function(context, container, delayedItems) {
	adapt.base.setCSSProperty(container.element, "overflow", "hidden");  // default value
	adapt.pm.PageBoxInstance.prototype.prepareContainer.call(this, context, container, delayedItems);
};


//--------------------- parsing -----------------------

/**
 * @param {adapt.expr.LexicalScope} scope
 * @param {adapt.cssparse.DispatchParserHandler} owner
 * @param {adapt.pm.PageBox} target
 * @param {adapt.cssvalid.ValidatorSet} validatorSet
 * @constructor
 * @extends {adapt.cssparse.SlaveParserHandler}
 * @implements {adapt.cssvalid.PropertyReceiver}
 */
adapt.pm.PageBoxParserHandler = function(scope, owner, target, validatorSet) {
	adapt.cssparse.SlaveParserHandler.call(this, scope, owner, false);
	/** @const */ this.target = target;
	/** @const */ this.validatorSet = validatorSet;
};
goog.inherits(adapt.pm.PageBoxParserHandler, adapt.cssparse.SlaveParserHandler);

/**
 * @override
 */
adapt.pm.PageBoxParserHandler.prototype.property = function(name, value, important) {
    this.validatorSet.validatePropertyAndHandleShorthand(name, value, important, this);
};

/**
 * @override
 */
adapt.pm.PageBoxParserHandler.prototype.unknownProperty = function(name, value) {
    this.reportAndSkip("E_INVALID_PROPERTY " + name + ": " + value.toString());
};

/**
 * @override
 */
adapt.pm.PageBoxParserHandler.prototype.invalidPropertyValue = function(name, value) {
    this.reportAndSkip("E_INVALID_PROPERTY_VALUE " + name + ": " + value.toString());
};

/**
 * @override
 */
adapt.pm.PageBoxParserHandler.prototype.simpleProperty = function(name, value, important) {
    this.target.specified[name] = new adapt.csscasc.CascadeValue(value, 
    		important ? adapt.cssparse.SPECIFICITY_STYLE:adapt.cssparse.SPECIFICITY_STYLE_IMPORTANT);
};


/**
 * @param {adapt.expr.LexicalScope} scope
 * @param {adapt.cssparse.DispatchParserHandler} owner
 * @param {adapt.pm.Partition} target
 * @param {adapt.cssvalid.ValidatorSet} validatorSet
 * @constructor
 * @extends {adapt.pm.PageBoxParserHandler}
 */
adapt.pm.PartitionParserHandler = function(scope, owner, target, validatorSet) {
	adapt.pm.PageBoxParserHandler.call(this, scope, owner, target, validatorSet);
};
goog.inherits(adapt.pm.PartitionParserHandler, adapt.pm.PageBoxParserHandler);


/**
 * @param {adapt.expr.LexicalScope} scope
 * @param {adapt.cssparse.DispatchParserHandler} owner
 * @param {adapt.pm.PartitionGroup} target
 * @param {adapt.cssvalid.ValidatorSet} validatorSet
 * @constructor
 * @extends {adapt.pm.PageBoxParserHandler}
 */
adapt.pm.PartitionGroupParserHandler = function(scope, owner, target, validatorSet) {
	adapt.pm.PageBoxParserHandler.call(this, scope, owner, target, validatorSet);
    target.specified["width"] = new adapt.csscasc.CascadeValue(adapt.css.hundredPercent, 0);
    target.specified["height"] = new adapt.csscasc.CascadeValue(adapt.css.hundredPercent, 0);
};
goog.inherits(adapt.pm.PartitionGroupParserHandler, adapt.pm.PageBoxParserHandler);

/**
 * @override
 */
adapt.pm.PartitionGroupParserHandler.prototype.startPartitionRule = function(name, pseudoName, classes) {
    var partition = new adapt.pm.Partition(this.scope, name, pseudoName, classes, this.target);
    var handler = new adapt.pm.PartitionParserHandler(this.scope, this.owner,
    		partition, this.validatorSet);
    this.owner.pushHandler(handler);
};

/**
 * @override
 */
adapt.pm.PartitionGroupParserHandler.prototype.startPartitionGroupRule = function(name, pseudoName, classes) {
    var partitionGroup = new adapt.pm.PartitionGroup(this.scope, name, pseudoName, classes, this.target);
    var handler = new adapt.pm.PartitionGroupParserHandler(this.scope, this.owner,
    		partitionGroup, this.validatorSet);
    this.owner.pushHandler(handler);
};


/**
 * @param {adapt.expr.LexicalScope} scope
 * @param {adapt.cssparse.DispatchParserHandler} owner
 * @param {adapt.pm.PageMaster} target
 * @param {adapt.cssvalid.ValidatorSet} validatorSet
 * @constructor
 * @extends {adapt.pm.PageBoxParserHandler}
 */
adapt.pm.PageMasterParserHandler = function(scope, owner, target, validatorSet) {
	adapt.pm.PageBoxParserHandler.call(this, scope, owner, target, validatorSet);
};
goog.inherits(adapt.pm.PageMasterParserHandler, adapt.pm.PageBoxParserHandler);

/**
 * @override
 */
adapt.pm.PageMasterParserHandler.prototype.startPartitionRule = function(name, pseudoName, classes) {
    var partition = new adapt.pm.Partition(this.scope, name, pseudoName, classes, this.target);
    var handler = new adapt.pm.PartitionParserHandler(this.scope, this.owner,
    		partition, this.validatorSet);
    this.owner.pushHandler(handler);
};

/**
 * @override
 */
adapt.pm.PageMasterParserHandler.prototype.startPartitionGroupRule = function(name, pseudoName, classes) {
    var partitionGroup = new adapt.pm.PartitionGroup(this.scope, name, pseudoName, classes, this.target);
    var handler = new adapt.pm.PartitionGroupParserHandler(this.scope, this.owner,
    		partitionGroup, this.validatorSet);
    this.owner.pushHandler(handler);
};



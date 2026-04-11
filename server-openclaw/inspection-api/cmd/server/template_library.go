package main

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type InspectionTemplateCategory struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	Name        string    `json:"name"`
	Code        string    `json:"code"`
	Description string    `json:"description"`
	SortOrder   int       `json:"sortOrder"`
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type InspectionTemplateItem struct {
	ID                  uint                       `json:"id" gorm:"primaryKey"`
	CategoryID          uint                       `json:"categoryId"`
	Category            InspectionTemplateCategory `json:"category"`
	Name                string                     `json:"name"`
	Code                string                     `json:"code"`
	PromptText          string                     `json:"promptText"`
	StandardText        string                     `json:"standardText"`
	StandardScore       float64                    `json:"standardScore"`
	ValidHours          int                        `json:"validHours"`
	Priority            int                        `json:"priority"`
	RecommendedItemType string                     `json:"recommendedItemType"`
	SortOrder           int                        `json:"sortOrder"`
	Enabled             bool                       `json:"enabled"`
	CreatedAt           time.Time                  `json:"createdAt"`
	UpdatedAt           time.Time                  `json:"updatedAt"`
}

type templateCategoryListItem struct {
	InspectionTemplateCategory
	ItemCount int64 `json:"itemCount"`
}

type templateSeedCategory struct {
	Name        string
	Code        string
	Description string
	SortOrder   int
	Items       []templateSeedItem
}

type templateSeedItem struct {
	Name                string
	Code                string
	StandardScore       float64
	ValidHours          int
	Priority            int
	RecommendedItemType string
	Details             []string
}

func buildRealtimeInspectionTemplateSeed() []templateSeedCategory {
	return []templateSeedCategory{
		{
			Name:        "【实时】门脸形象",
			Code:        "REALTIME_FACADE",
			Description: "检查门店门头、店外卫生、企划物料与外立面设备是否符合营业标准。",
			SortOrder:   10,
			Items: []templateSeedItem{
				{
					Name:                "门头前方所有区域卫生",
					Code:                "REALTIME_FACADE_CLEAN_FRONT",
					StandardScore:       2,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"门口装修范围内保持干净整洁（无纸屑、无树叶、无废弃包装袋等）",
						"玻璃橱窗和墙面无积尘、水渍、无泥渍、无遗留胶印",
					},
				},
				{
					Name:                "店外未堆放废纸、杂物",
					Code:                "REALTIME_FACADE_NO_OUTDOOR_CLUTTER",
					StandardScore:       2,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"门店外杂物（扫把、水桶、拖把、纸皮、手推车等）须在1小时内处理完成",
					},
				},
				{
					Name:                "企划检查",
					Code:                "REALTIME_FACADE_CAMPAIGN",
					StandardScore:       6,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"不得出现非公司和社区要求以外的物料。",
						"门店企划无涂改乱画、褪色、破损、遮挡等，不得张贴已过期的企划物料。",
						"墙面按照标准张贴完好的营业时间牌及品牌企划物料",
					},
				},
				{
					Name:                "店外设备检查",
					Code:                "REALTIME_FACADE_DEVICE",
					StandardScore:       4,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"设备正常运行",
						"店外灯在规定时段内准时开启",
					},
				},
			},
		},
		{
			Name:        "【实时】收银台规范",
			Code:        "REALTIME_CASHIER",
			Description: "检查收银台值守、收银区卫生和陈列是否满足营业要求。",
			SortOrder:   20,
			Items: []templateSeedItem{
				{
					Name:                "来客时收银台有值班人员",
					Code:                "REALTIME_CASHIER_DUTY",
					StandardScore:       2,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"非高峰期遇顾客结账须在1分钟内进行结算，高峰期收银台必须有人值班。",
					},
				},
				{
					Name:                "收银区域及商品陈列位干净整洁",
					Code:                "REALTIME_CASHIER_CLEAN",
					StandardScore:       3,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"收银台区域无明显垃圾、购物袋、小票、商品、非公司物品物料、购物篮等",
						"收银台前商品陈列整齐饱满",
					},
				},
			},
		},
		{
			Name:        "【实时】员工标准",
			Code:        "REALTIME_STAFF",
			Description: "检查员工卫生、着装、服务礼仪和上班状态。",
			SortOrder:   30,
			Items: []templateSeedItem{
				{
					Name:                "人员卫生",
					Code:                "REALTIME_STAFF_HYGIENE",
					StandardScore:       2,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"女员工长发（超过肩头）需全部扎起，男员工不得留长发（头发不得遮耳，扫领）",
					},
				},
				{
					Name:                "服饰仪表",
					Code:                "REALTIME_STAFF_UNIFORM",
					StandardScore:       6,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"不得穿拖鞋、凉鞋、高跟鞋；单鞋踩脚后跟视为拖鞋。",
						"门店营业时间应穿戴好工服；未着工装不得进入收银台区域且不得从事门店相关工作。",
						"上班期间不穿吊带、背心，裙子、膝盖以上的裤子。",
						"单店工服需统一颜色。",
					},
				},
				{
					Name:                "员工服务",
					Code:                "REALTIME_STAFF_SERVICE",
					StandardScore:       4,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"顾客进店亲切待客，收银结算唱收唱付",
					},
				},
				{
					Name:                "上班状态",
					Code:                "REALTIME_STAFF_ON_DUTY",
					StandardScore:       4,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"顾客购物时，不得斜靠、倚靠、坐在货架或柱子旁边、玩手机，双手不得抱在胸前。",
						"不得出现扎堆聊天、对顾客询问不答、无礼貌用语、未对商品情况进行介绍等现象。",
						"上班时间不得在卖场吃零食，店内和门头区域不得着工装抽烟。",
						"用餐时遇顾客结算需及时停餐服务，不得在收银台及正门口用餐。",
					},
				},
			},
		},
		{
			Name:        "【实时】店内形象",
			Code:        "REALTIME_INTERIOR",
			Description: "检查卖场环境、设备、营业规范与店内整体形象。",
			SortOrder:   40,
			Items: []templateSeedItem{
				{
					Name:                "店内所有垃圾桶整洁",
					Code:                "REALTIME_INTERIOR_TRASH",
					StandardScore:       2,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"垃圾桶统一、干净整洁、无异味、无过夜垃圾，桶身及周边无纸屑和满溢情况",
					},
				},
				{
					Name:                "物料放置",
					Code:                "REALTIME_INTERIOR_MATERIAL",
					StandardScore:       6,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"不得长时间占用门店购物篮、休闲桌椅等门店物料。",
						"物料需放置于对应位置，不得随意放置",
						"店内物料无破损、无污渍、无褪色、无胶印",
					},
				},
				{
					Name:                "店内设备检查",
					Code:                "REALTIME_INTERIOR_DEVICE",
					StandardScore:       6,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"准时或提前开启小音",
						"准时或提前开启电视",
						"营业时间内卖场灯具需全部打开",
					},
				},
				{
					Name:                "卖场标准检查",
					Code:                "REALTIME_INTERIOR_STANDARD",
					StandardScore:       5,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"大仓来货需在4个小时内处理完成，16点后到货可不考核处理时长，但不可散乱放置，非陈列位置不得放置货物。",
					},
				},
				{
					Name:                "营业时间规范",
					Code:                "REALTIME_INTERIOR_BUSINESS_HOURS",
					StandardScore:       2,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"按营业时间牌的时间营业，不得延迟营业或提前关门",
					},
				},
				{
					Name:                "店内卫生",
					Code:                "REALTIME_INTERIOR_CLEAN",
					StandardScore:       2,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"店内地板、物料无明显垃圾或污渍",
					},
				},
				{
					Name:                "卖场不放置/张贴非公司物品",
					Code:                "REALTIME_INTERIOR_NO_PRIVATE_ITEMS",
					StandardScore:       4,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"不得把非公司物品放置或张贴于卖场，顾客私人物品放置卖场需1小时内处理完成。",
					},
				},
				{
					Name:                "不得私自加装设备",
					Code:                "REALTIME_INTERIOR_NO_EXTRA_DEVICE",
					StandardScore:       4,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"卖场不得私自加装桌椅、电器设施等固定使用的设备",
					},
				},
			},
		},
		{
			Name:        "【实时】商品陈列",
			Code:        "REALTIME_GOODS",
			Description: "检查商品陈列是否整齐饱满，以及货物离地等基础规范。",
			SortOrder:   50,
			Items: []templateSeedItem{
				{
					Name:                "卖场商品陈列整齐饱满",
					Code:                "REALTIME_GOODS_DISPLAY",
					StandardScore:       8,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"卖场商品陈列应整齐、饱满、无明显空架或凌乱堆放",
					},
				},
				{
					Name:                "所有货物离地",
					Code:                "REALTIME_GOODS_OFF_GROUND",
					StandardScore:       2,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"货物放置地面应做防潮垫，不得未做防潮措施放置隔夜。",
					},
				},
			},
		},
		{
			Name:        "【实时】公司红线",
			Code:        "REALTIME_REDLINE",
			Description: "记录需要重点关注的商品与经营红线事项。",
			SortOrder:   60,
			Items: []templateSeedItem{
				{
					Name:                "保质期过期",
					Code:                "REALTIME_REDLINE_EXPIRED",
					StandardScore:       6,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"不得出现保质期过期商品",
					},
				},
				{
					Name:                "商品无外采情况",
					Code:                "REALTIME_REDLINE_EXTERNAL_PURCHASE",
					StandardScore:       6,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"商品不得存在外采情况",
					},
				},
				{
					Name:                "商品价格无异常",
					Code:                "REALTIME_REDLINE_PRICE",
					StandardScore:       6,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"商品价格标识应正常，无明显异常",
					},
				},
				{
					Name:                "门店不私自开展活动",
					Code:                "REALTIME_REDLINE_ACTIVITY",
					StandardScore:       6,
					ValidHours:          3,
					Priority:            0,
					RecommendedItemType: "generic",
					Details: []string{
						"门店不得私自开展活动或张贴未授权活动宣传",
					},
				},
			},
		},
	}
}

func mustSeedInspectionTemplateLibrary(db *gorm.DB) {
	for _, categorySeed := range buildRealtimeInspectionTemplateSeed() {
		category := ensureTemplateCategory(db, InspectionTemplateCategory{
			Name:        categorySeed.Name,
			Code:        categorySeed.Code,
			Description: categorySeed.Description,
			SortOrder:   categorySeed.SortOrder,
			Enabled:     true,
		})
		ensureTemplateItems(db, category.ID, categorySeed.Items)
	}
}

func mustSeedTemplateDrivenPlan(db *gorm.DB, store Store, stream StoreStream) {
	plan := ensurePlan(db, InspectionPlan{
		Name:                  "成都小智零食有鸣-实时检查计划",
		Code:                  "STORE_REALTIME_TEMPLATE_PLAN",
		PlanType:              "description_inspection",
		Description:           "根据实时检查模板生成，覆盖门脸、收银台、员工、店内形象、商品陈列与公司红线。",
		FramePickMode:         "first",
		MatchThresholdPercent: 78,
		Enabled:               true,
	})

	var templateItems []InspectionTemplateItem
	if err := db.Preload("Category").Joins("JOIN inspection_template_categories ON inspection_template_categories.id = inspection_template_items.category_id").
		Where("inspection_template_items.enabled = ?", true).
		Order("inspection_template_categories.sort_order asc, inspection_template_items.sort_order asc, inspection_template_items.id asc").
		Find(&templateItems).Error; err != nil {
		panic(err)
	}

	planItems := []InspectionPlanItem{
		{
			ItemType:  "scene_expectation",
			Content:   "画面应为成都小智零食有鸣门店营业中的监控场景，能够看到卖场、收银台、员工或商品陈列区域，不应是样片、测试图或故障画面。",
			SortOrder: 10,
			Required:  true,
			Enabled:   true,
		},
	}
	for index, item := range templateItems {
		planItems = append(planItems, InspectionPlanItem{
			ItemType:  "generic",
			Content:   buildPlanContentFromTemplateItem(item),
			SortOrder: (index + 2) * 10,
			Required:  true,
			Enabled:   true,
		})
	}
	ensurePlanItems(db, plan.ID, planItems)
	ensureBinding(db, StorePlanBinding{
		StoreID:                     store.ID,
		PlanID:                      plan.ID,
		StreamID:                    stream.ID,
		CustomMatchThresholdPercent: 78,
		Enabled:                     true,
	})
	ensureAlertRule(db, AlertRule{
		StoreID:       store.ID,
		PlanID:        plan.ID,
		ChannelType:   "wecom",
		TargetID:      "replace-with-wecom-chatid",
		MentionUserID: "replace-with-userid",
		Enabled:       true,
	})
}

func ensureTemplateCategory(db *gorm.DB, payload InspectionTemplateCategory) InspectionTemplateCategory {
	var item InspectionTemplateCategory
	err := db.Where("code = ?", payload.Code).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if err := db.Create(&payload).Error; err != nil {
			panic(err)
		}
		return payload
	}
	if err != nil {
		panic(err)
	}
	if err := db.Model(&item).Updates(map[string]interface{}{
		"name":        payload.Name,
		"description": payload.Description,
		"sort_order":  payload.SortOrder,
		"enabled":     payload.Enabled,
	}).Error; err != nil {
		panic(err)
	}
	if err := db.First(&item, item.ID).Error; err != nil {
		panic(err)
	}
	return item
}

func ensureTemplateItems(db *gorm.DB, categoryID uint, seeds []templateSeedItem) {
	if err := db.Where("category_id = ?", categoryID).Delete(&InspectionTemplateItem{}).Error; err != nil {
		panic(err)
	}
	items := make([]InspectionTemplateItem, 0, len(seeds))
	for index, seed := range seeds {
		standardText := joinTemplateLines(seed.Details, "\n")
		items = append(items, InspectionTemplateItem{
			CategoryID:          categoryID,
			Name:                seed.Name,
			Code:                seed.Code,
			PromptText:          buildTemplatePrompt(seed.Name, seed.Details),
			StandardText:        standardText,
			StandardScore:       seed.StandardScore,
			ValidHours:          seed.ValidHours,
			Priority:            seed.Priority,
			RecommendedItemType: valueOr(seed.RecommendedItemType, "generic"),
			SortOrder:           (index + 1) * 10,
			Enabled:             true,
		})
	}
	if len(items) == 0 {
		return
	}
	if err := db.Create(&items).Error; err != nil {
		panic(err)
	}
}

func buildTemplatePrompt(itemName string, details []string) string {
	clauses := joinTemplateLines(details, "；")
	if clauses == "" {
		return itemName
	}
	return fmt.Sprintf("%s：%s", itemName, clauses)
}

func buildPlanContentFromTemplateItem(item InspectionTemplateItem) string {
	categoryName := strings.TrimSpace(item.Category.Name)
	itemName := strings.TrimSpace(item.Name)
	promptText := strings.TrimSpace(item.PromptText)
	switch {
	case categoryName != "" && promptText != "":
		return fmt.Sprintf("%s / %s", categoryName, promptText)
	case promptText != "":
		return promptText
	case categoryName != "" && itemName != "":
		return fmt.Sprintf("%s / %s", categoryName, itemName)
	default:
		return itemName
	}
}

func joinTemplateLines(lines []string, separator string) string {
	seen := map[string]struct{}{}
	cleaned := make([]string, 0, len(lines))
	for _, line := range lines {
		text := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(line, "\r\n", "\n"), "\r", "\n"))
		text = strings.TrimPrefix(text, "1、")
		if strings.Count(text, "\n") > 0 {
			text = strings.Join(splitAndTrim(text), "；")
		}
		text = strings.TrimSpace(text)
		if text == "" {
			continue
		}
		if _, ok := seen[text]; ok {
			continue
		}
		seen[text] = struct{}{}
		cleaned = append(cleaned, text)
	}
	return strings.Join(cleaned, separator)
}

func splitAndTrim(text string) []string {
	parts := strings.Split(text, "\n")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		result = append(result, trimmed)
	}
	return result
}

func (app *App) listTemplateCategories(ctx *gin.Context) {
	var categories []InspectionTemplateCategory
	query := strings.TrimSpace(ctx.Query("query"))
	db := app.db.Order("sort_order asc, id asc")
	if query != "" {
		like := "%" + query + "%"
		db = db.Where("name LIKE ? OR code LIKE ?", like, like)
	}
	if err := db.Find(&categories).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}

	type itemCountRow struct {
		CategoryID uint
		Total      int64
	}
	var countRows []itemCountRow
	if err := app.db.Model(&InspectionTemplateItem{}).
		Select("category_id, count(*) as total").
		Group("category_id").
		Scan(&countRows).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	countMap := make(map[uint]int64, len(countRows))
	for _, row := range countRows {
		countMap[row.CategoryID] = row.Total
	}

	response := make([]templateCategoryListItem, 0, len(categories))
	for _, category := range categories {
		response = append(response, templateCategoryListItem{
			InspectionTemplateCategory: category,
			ItemCount:                  countMap[category.ID],
		})
	}
	success(ctx, response)
}

func (app *App) listTemplateItems(ctx *gin.Context) {
	query := app.db.Preload("Category").Order("sort_order asc, id asc")

	if categoryID, err := parseOptionalUint(ctx.Query("categoryId")); err != nil {
		fail(ctx, http.StatusBadRequest, "invalid category id")
		return
	} else if categoryID > 0 {
		query = query.Where("category_id = ?", categoryID)
	}

	keyword := strings.TrimSpace(ctx.Query("query"))
	if keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("name LIKE ? OR code LIKE ? OR prompt_text LIKE ?", like, like, like)
	}

	var items []InspectionTemplateItem
	if err := query.Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, items)
}

func (app *App) listTemplateItemsByCategory(ctx *gin.Context) {
	categoryID, err := parseID(ctx, "id")
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid category id")
		return
	}
	var items []InspectionTemplateItem
	if err := app.db.Preload("Category").
		Where("category_id = ?", categoryID).
		Order("sort_order asc, id asc").
		Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, items)
}

func parseOptionalUint(raw string) (uint, error) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return 0, nil
	}
	value, err := strconv.ParseUint(text, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(value), nil
}

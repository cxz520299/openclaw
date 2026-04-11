package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/glebarez/sqlite"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Config struct {
	Port          string
	DatabaseDriver string
	DatabaseDSN   string
	AllowedOrigins []string
}

type App struct {
	cfg Config
	db  *gorm.DB
}

var storeAliasMap = map[string][]string{}

type APIResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type Store struct {
	ID                uint      `json:"id" gorm:"primaryKey"`
	Name              string    `json:"name"`
	Code              string    `json:"code"`
	AliasList         string    `json:"aliasList"`
	Region            string    `json:"region"`
	Status            string    `json:"status"`
	ManagerName       string    `json:"managerName"`
	ManagerWecomUserID string   `json:"managerWecomUserId"`
	Remark            string    `json:"remark"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type StoreStream struct {
	ID                uint      `json:"id" gorm:"primaryKey"`
	StoreID           uint      `json:"storeId"`
	Store             Store     `json:"store"`
	Name              string    `json:"name"`
	AliasList         string    `json:"aliasList"`
	StreamURL         string    `json:"streamUrl"`
	StreamType        string    `json:"streamType"`
	SourceAlias       string    `json:"sourceAlias"`
	BaselineImageURL  string    `json:"baselineImageUrl"`
	BaselineImagePath string    `json:"baselineImagePath"`
	Enabled           bool      `json:"enabled"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type InspectionPlan struct {
	ID                        uint      `json:"id" gorm:"primaryKey"`
	Name                      string    `json:"name"`
	Code                      string    `json:"code"`
	AliasList                 string    `json:"aliasList"`
	TriggerKeywords           string    `json:"triggerKeywords"`
	PlanType                  string    `json:"planType"`
	Description               string    `json:"description"`
	FramePickMode             string    `json:"framePickMode"`
	MatchThresholdPercent     float64   `json:"matchThresholdPercent"`
	DifferenceThresholdPercent float64  `json:"differenceThresholdPercent"`
	Enabled                   bool      `json:"enabled"`
	CreatedAt                 time.Time `json:"createdAt"`
	UpdatedAt                 time.Time `json:"updatedAt"`
}

type InspectionPlanItem struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	PlanID    uint      `json:"planId"`
	ItemType  string    `json:"itemType"`
	Content   string    `json:"content"`
	SortOrder int       `json:"sortOrder"`
	Required  bool      `json:"required"`
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type StorePlanBinding struct {
	ID                           uint           `json:"id" gorm:"primaryKey"`
	StoreID                      uint           `json:"storeId"`
	Store                        Store          `json:"store"`
	PlanID                       uint           `json:"planId"`
	Plan                         InspectionPlan `json:"plan"`
	StreamID                     uint           `json:"streamId"`
	Stream                       StoreStream    `json:"stream"`
	CustomMatchThresholdPercent  float64        `json:"customMatchThresholdPercent"`
	CustomDifferenceThresholdPercent float64    `json:"customDifferenceThresholdPercent"`
	Enabled                      bool           `json:"enabled"`
	CreatedAt                    time.Time      `json:"createdAt"`
	UpdatedAt                    time.Time      `json:"updatedAt"`
}

type InspectionJob struct {
	ID               uint       `json:"id" gorm:"primaryKey"`
	JobNo            string     `json:"jobNo"`
	StoreID          uint       `json:"storeId"`
	Store            Store      `json:"store"`
	PlanID           uint       `json:"planId"`
	Plan             InspectionPlan `json:"plan"`
	BindingID        uint       `json:"bindingId"`
	Binding          StorePlanBinding `json:"binding,omitempty" gorm:"foreignKey:BindingID"`
	TriggerType      string     `json:"triggerType"`
	TriggerSource    string     `json:"triggerSource"`
	OperatorName     string     `json:"operatorName"`
	OperatorWecomUserID string  `json:"operatorWecomUserId"`
	Status           string     `json:"status"`
	StartedAt        *time.Time `json:"startedAt"`
	FinishedAt       *time.Time `json:"finishedAt"`
	ErrorMessage     string     `json:"errorMessage"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
	Result           *InspectionResult `json:"result,omitempty" gorm:"foreignKey:JobID"`
}

type InspectionResult struct {
	ID                        uint      `json:"id" gorm:"primaryKey"`
	JobID                     uint      `json:"jobId"`
	StoreName                 string    `json:"storeName"`
	PlanName                  string    `json:"planName"`
	MonitorName               string    `json:"monitorName"`
	Source                    string    `json:"source"`
	InspectionType            string    `json:"inspectionType"`
	FramePickMode             string    `json:"framePickMode"`
	SampledAtSeconds          float64   `json:"sampledAtSeconds"`
	Verdict                   string    `json:"verdict"`
	MatchPercent              float64   `json:"matchPercent"`
	DifferencePercent         float64   `json:"differencePercent"`
	ObservedSummary           string    `json:"observedSummary"`
	FallbackUsed              bool      `json:"fallbackUsed"`
	FallbackReason            string    `json:"fallbackReason"`
	PluginRecommendation      string    `json:"pluginRecommendation"`
	PluginRecommendationReason string   `json:"pluginRecommendationReason"`
	ReportURL                 string    `json:"reportUrl"`
	DocURL                    string    `json:"docUrl"`
	CreatedAt                 time.Time `json:"createdAt"`
	Items                     []InspectionResultItem `json:"items,omitempty" gorm:"foreignKey:ResultID"`
	Artifacts                 []InspectionArtifact   `json:"artifacts,omitempty" gorm:"foreignKey:ResultID"`
}

type InspectionResultItem struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	ResultID  uint      `json:"resultId"`
	Clause    string    `json:"clause"`
	ClauseType string   `json:"clauseType"`
	Matched   bool      `json:"matched"`
	Evidence  string    `json:"evidence"`
	CreatedAt time.Time `json:"createdAt"`
}

type InspectionArtifact struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	ResultID    uint      `json:"resultId"`
	ArtifactType string   `json:"artifactType"`
	FileURL     string    `json:"fileUrl"`
	FilePath    string    `json:"filePath"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Schedule struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	StoreID   uint      `json:"storeId"`
	PlanID    uint      `json:"planId"`
	CronExpr  string    `json:"cronExpr"`
	Enabled   bool      `json:"enabled"`
	LastRunAt *time.Time `json:"lastRunAt"`
	NextRunAt *time.Time `json:"nextRunAt"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type AlertRule struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	StoreID      uint      `json:"storeId"`
	PlanID       uint      `json:"planId"`
	ChannelType  string    `json:"channelType"`
	TargetID     string    `json:"targetId"`
	MentionUserID string   `json:"mentionUserId"`
	Enabled      bool      `json:"enabled"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type executeContextRequest struct {
	StoreID   uint   `json:"storeId"`
	StoreName string `json:"storeName"`
	PlanID    uint   `json:"planId"`
	PlanName  string `json:"planName"`
	Source    string `json:"source"`
}

type manualExecutionRequest struct {
	StoreID            uint   `json:"storeId"`
	StoreName          string `json:"storeName"`
	PlanID             uint   `json:"planId"`
	PlanName           string `json:"planName"`
	Source             string `json:"source"`
	OperatorName       string `json:"operatorName"`
	OperatorWecomUserID string `json:"operatorWecomUserId"`
	TriggerType        string `json:"triggerType"`
	TriggerSource      string `json:"triggerSource"`
}

type inspectionResultCreateRequest struct {
	JobID                      uint    `json:"jobId"`
	StoreName                  string  `json:"storeName"`
	PlanName                   string  `json:"planName"`
	MonitorName                string  `json:"monitorName"`
	Source                     string  `json:"source"`
	InspectionType             string  `json:"inspectionType"`
	FramePickMode              string  `json:"framePickMode"`
	SampledAtSeconds           float64 `json:"sampledAtSeconds"`
	Verdict                    string  `json:"verdict"`
	MatchPercent               float64 `json:"matchPercent"`
	DifferencePercent          float64 `json:"differencePercent"`
	ObservedSummary            string  `json:"observedSummary"`
	FallbackUsed               bool    `json:"fallbackUsed"`
	FallbackReason             string  `json:"fallbackReason"`
	PluginRecommendation       string  `json:"pluginRecommendation"`
	PluginRecommendationReason string  `json:"pluginRecommendationReason"`
	ReportURL                  string  `json:"reportUrl"`
	DocURL                     string  `json:"docUrl"`
	Items                      []InspectionResultItem `json:"items"`
	Artifacts                  []InspectionArtifact   `json:"artifacts"`
}

func main() {
	cfg := loadConfig()
	db := mustOpenDatabase(cfg)
	mustMigrate(db)
	mustSeed(db)

	app := &App{cfg: cfg, db: db}

	router := gin.Default()
	router.Use(app.cors())

	router.GET("/healthz", func(ctx *gin.Context) {
		success(ctx, gin.H{"status": "ok"})
	})

	api := router.Group("/api")
	{
		api.GET("/meta/summary", app.getSummary)

		api.GET("/stores", app.listStores)
		api.POST("/stores", app.createStore)
		api.PUT("/stores/:id", app.updateStore)

		api.GET("/store-streams", app.listStreams)
		api.POST("/store-streams", app.createStream)
		api.PUT("/store-streams/:id", app.updateStream)

		api.GET("/inspection-plans", app.listPlans)
		api.POST("/inspection-plans", app.createPlan)
		api.PUT("/inspection-plans/:id", app.updatePlan)
		api.GET("/inspection-template-categories", app.listTemplateCategories)
		api.GET("/inspection-template-categories/:id/items", app.listTemplateItemsByCategory)
		api.GET("/inspection-template-items", app.listTemplateItems)

		api.GET("/inspection-plans/:id/items", app.listPlanItems)
		api.POST("/inspection-plans/:id/items", app.createPlanItem)
		api.PUT("/inspection-plan-items/:id", app.updatePlanItem)

		api.GET("/store-plan-bindings", app.listBindings)
		api.POST("/store-plan-bindings", app.createBinding)
		api.PUT("/store-plan-bindings/:id", app.updateBinding)

		api.GET("/inspection-jobs", app.listJobs)
		api.GET("/inspection-jobs/:id", app.getJob)
		api.GET("/inspection-results/:id", app.getResult)

		api.GET("/schedules", app.listSchedules)
		api.POST("/schedules", app.createSchedule)
		api.PUT("/schedules/:id", app.updateSchedule)

		api.POST("/execute/context", app.executeContext)
		api.POST("/manual-executions", app.createManualExecution)
		api.POST("/inspection-results", app.createInspectionResult)
	}

	if err := router.Run(":" + cfg.Port); err != nil {
		panic(err)
	}
}

func loadConfig() Config {
	driver := strings.TrimSpace(os.Getenv("INSPECTION_DB_DRIVER"))
	if driver == "" {
		driver = "sqlite"
	}
	dsn := strings.TrimSpace(os.Getenv("INSPECTION_DB_DSN"))
	if dsn == "" {
		dsn = "data/inspection-platform.db"
	}
	port := strings.TrimSpace(os.Getenv("INSPECTION_API_PORT"))
	if port == "" {
		port = "8080"
	}
	origins := strings.TrimSpace(os.Getenv("INSPECTION_ALLOWED_ORIGINS"))
	allowList := []string{"*"}
	if origins != "" {
		allowList = strings.Split(origins, ",")
	}
	return Config{
		Port:           port,
		DatabaseDriver: driver,
		DatabaseDSN:    dsn,
		AllowedOrigins: allowList,
	}
}

func mustOpenDatabase(cfg Config) *gorm.DB {
	switch cfg.DatabaseDriver {
	case "mysql":
		db, err := gorm.Open(mysql.Open(cfg.DatabaseDSN), &gorm.Config{})
		if err != nil {
			panic(err)
		}
		return db
	default:
		if err := os.MkdirAll(filepath.Dir(cfg.DatabaseDSN), 0o755); err != nil {
			panic(err)
		}
		db, err := gorm.Open(sqlite.Open(cfg.DatabaseDSN), &gorm.Config{})
		if err != nil {
			panic(err)
		}
		return db
	}
}

func mustMigrate(db *gorm.DB) {
	err := db.AutoMigrate(
		&Store{},
		&StoreStream{},
		&InspectionPlan{},
		&InspectionPlanItem{},
		&InspectionTemplateCategory{},
		&InspectionTemplateItem{},
		&StorePlanBinding{},
		&InspectionJob{},
		&InspectionResult{},
		&InspectionResultItem{},
		&InspectionArtifact{},
		&Schedule{},
		&AlertRule{},
	)
	if err != nil {
		panic(err)
	}
}

func mustSeed(db *gorm.DB) {
	store := ensureStore(db, Store{
		Name:               "成都小智零食有鸣",
		Code:               "CD_XIAOZHI_LSYM",
		AliasList:          "成都逮虾户零食有鸣,成都小智零食有鸣,成都零食有鸣",
		Region:             "成都",
		Status:             "enabled",
		ManagerName:        "巡检负责人",
		ManagerWecomUserID: "replace-with-userid",
		Remark:             "默认演示门店，可直接通过门店名称触发巡检计划",
	})

	stream := ensureStoreStream(db, store.ID, StoreStream{
		Name:              "成都小智零食有鸣默认流",
		AliasList:         "默认监控,默认点位,卖场全景,营业画面",
		StreamURL:         "http://devimages.apple.com.edgekey.net/streaming/examples/bipbop_16x9/gear5/prog_index.m3u8",
		StreamType:        "hls",
		SourceAlias:       "https://devimages.apple.com.edgekey.net/streaming/examples/bipbop_16x9/gear5/prog_index.m3u8",
		BaselineImagePath: "/home/node/.openclaw/workspace/stream-watch/public-hls-sample/baseline.png",
		Enabled:           true,
	})

	baselinePlan := ensurePlan(db, InspectionPlan{
		Name:                       "门店基准图巡检",
		Code:                       "STORE_BASELINE_PLAN",
		AliasList:                  "基准图巡检,图片基准巡检,计划一,门店基准图",
		TriggerKeywords:            "基准图,图片比对,相似度,差异图",
		PlanType:                   "baseline_inspection",
		Description:                "基于门店基准图检查默认流媒体首帧是否与预期一致",
		FramePickMode:              "first",
		DifferenceThresholdPercent: 12,
		Enabled:                    true,
	})
	ensurePlanItems(db, baselinePlan.ID, nil)
	ensureBinding(db, StorePlanBinding{
		StoreID:                          store.ID,
		PlanID:                           baselinePlan.ID,
		StreamID:                         stream.ID,
		CustomDifferenceThresholdPercent: 12,
		Enabled:                          true,
	})
	ensureAlertRule(db, AlertRule{
		StoreID:       store.ID,
		PlanID:        baselinePlan.ID,
		ChannelType:   "wecom",
		TargetID:      "replace-with-wecom-chatid",
		MentionUserID: "replace-with-userid",
		Enabled:       true,
	})

	descriptionPlan := ensurePlan(db, InspectionPlan{
		Name:                  "营业画面点检",
		Code:                  "STORE_DESCRIPTION_PLAN",
		AliasList:             "实时检查计划,点检项巡检,营业巡检,计划二",
		TriggerKeywords:       "实时检查,点检,巡检,营业画面,文字巡检",
		PlanType:              "description_inspection",
		Description:           "根据门店预设点检项判断当前画面是否正常播放且符合预期",
		FramePickMode:         "first",
		MatchThresholdPercent: 75,
		Enabled:               true,
	})
	ensurePlanItems(db, descriptionPlan.ID, []InspectionPlanItem{
		{ItemType: "scene_expectation", Content: "画面是正常播放的彩色视频样片", SortOrder: 10, Required: true, Enabled: true},
		{ItemType: "must_have", Content: "画面内容清晰可见", SortOrder: 20, Required: true, Enabled: true},
		{ItemType: "must_not_have", Content: "不是黑屏或纯色测试图", SortOrder: 30, Required: true, Enabled: true},
		{ItemType: "must_not_have", Content: "不是静态故障页或明显卡死画面", SortOrder: 40, Required: true, Enabled: true},
	})
	ensureBinding(db, StorePlanBinding{
		StoreID:                     store.ID,
		PlanID:                      descriptionPlan.ID,
		StreamID:                    stream.ID,
		CustomMatchThresholdPercent: 75,
		Enabled:                     true,
	})
	ensureAlertRule(db, AlertRule{
		StoreID:       store.ID,
		PlanID:        descriptionPlan.ID,
		ChannelType:   "wecom",
		TargetID:      "replace-with-wecom-chatid",
		MentionUserID: "replace-with-userid",
		Enabled:       true,
	})

	randomPlan := ensurePlan(db, InspectionPlan{
		Name:                  "随机巡场点检",
		Code:                  "STORE_RANDOM_PLAN",
		AliasList:             "随机巡检,随机抽检,巡场计划",
		TriggerKeywords:       "随机帧,随机巡场,随机巡检",
		PlanType:              "description_inspection",
		Description:           "随机抽帧检查流媒体是否处于正常播放状态",
		FramePickMode:         "random",
		MatchThresholdPercent: 70,
		Enabled:               true,
	})
	ensurePlanItems(db, randomPlan.ID, []InspectionPlanItem{
		{ItemType: "scene_expectation", Content: "画面是持续播放的彩色视频内容", SortOrder: 10, Required: true, Enabled: true},
		{ItemType: "must_not_have", Content: "不是黑屏", SortOrder: 20, Required: true, Enabled: true},
		{ItemType: "must_not_have", Content: "不是纯色测试画面", SortOrder: 30, Required: true, Enabled: true},
	})
	ensureBinding(db, StorePlanBinding{
		StoreID:                     store.ID,
		PlanID:                      randomPlan.ID,
		StreamID:                    stream.ID,
		CustomMatchThresholdPercent: 70,
		Enabled:                     true,
	})
	ensureAlertRule(db, AlertRule{
		StoreID:       store.ID,
		PlanID:        randomPlan.ID,
		ChannelType:   "wecom",
		TargetID:      "replace-with-wecom-chatid",
		MentionUserID: "replace-with-userid",
		Enabled:       true,
	})

	mustSeedInspectionTemplateLibrary(db)
	mustSeedTemplateDrivenPlan(db, store, stream)
}

func ensureStore(db *gorm.DB, payload Store) Store {
	var item Store
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
		"name":                  payload.Name,
		"region":                payload.Region,
		"alias_list":            payload.AliasList,
		"status":                payload.Status,
		"manager_name":          payload.ManagerName,
		"manager_wecom_user_id": payload.ManagerWecomUserID,
		"remark":                payload.Remark,
	}).Error; err != nil {
		panic(err)
	}
	if err := db.First(&item, item.ID).Error; err != nil {
		panic(err)
	}
	return item
}

func ensureStoreStream(db *gorm.DB, storeID uint, payload StoreStream) StoreStream {
	var item StoreStream
	err := db.Where("store_id = ? AND (stream_url = ? OR source_alias = ?)", storeID, payload.StreamURL, payload.StreamURL).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		err = db.Where("store_id = ? AND (stream_url = ? OR source_alias = ?)", storeID, payload.SourceAlias, payload.SourceAlias).First(&item).Error
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		payload.StoreID = storeID
		if err := db.Create(&payload).Error; err != nil {
			panic(err)
		}
		return payload
	}
	if err != nil {
		panic(err)
	}
	if err := db.Model(&item).Updates(map[string]interface{}{
		"name":                payload.Name,
		"alias_list":          payload.AliasList,
		"stream_url":          payload.StreamURL,
		"stream_type":         payload.StreamType,
		"source_alias":        payload.SourceAlias,
		"baseline_image_path": payload.BaselineImagePath,
		"baseline_image_url":  payload.BaselineImageURL,
		"enabled":             payload.Enabled,
	}).Error; err != nil {
		panic(err)
	}
	if err := db.First(&item, item.ID).Error; err != nil {
		panic(err)
	}
	return item
}

func ensurePlan(db *gorm.DB, payload InspectionPlan) InspectionPlan {
	var item InspectionPlan
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
		"name":                         payload.Name,
		"alias_list":                   payload.AliasList,
		"trigger_keywords":             payload.TriggerKeywords,
		"plan_type":                    payload.PlanType,
		"description":                  payload.Description,
		"frame_pick_mode":              payload.FramePickMode,
		"match_threshold_percent":      payload.MatchThresholdPercent,
		"difference_threshold_percent": payload.DifferenceThresholdPercent,
		"enabled":                      payload.Enabled,
	}).Error; err != nil {
		panic(err)
	}
	if err := db.First(&item, item.ID).Error; err != nil {
		panic(err)
	}
	return item
}

func ensurePlanItems(db *gorm.DB, planID uint, items []InspectionPlanItem) {
	if err := db.Where("plan_id = ?", planID).Delete(&InspectionPlanItem{}).Error; err != nil {
		panic(err)
	}
	if len(items) == 0 {
		return
	}
	for index := range items {
		items[index].ID = 0
		items[index].PlanID = planID
	}
	if err := db.Create(&items).Error; err != nil {
		panic(err)
	}
}

func ensureBinding(db *gorm.DB, payload StorePlanBinding) {
	var item StorePlanBinding
	err := db.Where("store_id = ? AND plan_id = ?", payload.StoreID, payload.PlanID).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if err := db.Create(&payload).Error; err != nil {
			panic(err)
		}
		return
	}
	if err != nil {
		panic(err)
	}
	if err := db.Model(&item).Updates(map[string]interface{}{
		"stream_id":                            payload.StreamID,
		"custom_match_threshold_percent":       payload.CustomMatchThresholdPercent,
		"custom_difference_threshold_percent":  payload.CustomDifferenceThresholdPercent,
		"enabled":                              payload.Enabled,
	}).Error; err != nil {
		panic(err)
	}
}

func ensureAlertRule(db *gorm.DB, payload AlertRule) {
	var item AlertRule
	err := db.Where("store_id = ? AND plan_id = ?", payload.StoreID, payload.PlanID).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if err := db.Create(&payload).Error; err != nil {
			panic(err)
		}
		return
	}
	if err != nil {
		panic(err)
	}
	if err := db.Model(&item).Updates(map[string]interface{}{
		"channel_type":   payload.ChannelType,
		"target_id":      payload.TargetID,
		"mention_user_id": payload.MentionUserID,
		"enabled":        payload.Enabled,
	}).Error; err != nil {
		panic(err)
	}
}

func (app *App) cors() gin.HandlerFunc {
	allowAll := len(app.cfg.AllowedOrigins) == 1 && strings.TrimSpace(app.cfg.AllowedOrigins[0]) == "*"
	allowMap := map[string]struct{}{}
	for _, origin := range app.cfg.AllowedOrigins {
		trimmed := strings.TrimSpace(origin)
		if trimmed != "" {
			allowMap[trimmed] = struct{}{}
		}
	}
	return func(ctx *gin.Context) {
		origin := ctx.GetHeader("Origin")
		if allowAll && origin != "" {
			ctx.Header("Access-Control-Allow-Origin", origin)
		}
		if _, ok := allowMap[origin]; ok {
			ctx.Header("Access-Control-Allow-Origin", origin)
		}
		ctx.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		ctx.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		if ctx.Request.Method == http.MethodOptions {
			ctx.AbortWithStatus(http.StatusNoContent)
			return
		}
		ctx.Next()
	}
}

func success(ctx *gin.Context, data interface{}) {
	ctx.JSON(http.StatusOK, APIResponse{Code: 0, Message: "ok", Data: data})
}

func fail(ctx *gin.Context, status int, message string) {
	ctx.JSON(status, APIResponse{Code: status, Message: message})
}

func parseID(ctx *gin.Context, key string) (uint, error) {
	raw := ctx.Param(key)
	id, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(id), nil
}

func (app *App) getSummary(ctx *gin.Context) {
	var stores, streams, plans, bindings, jobs, results int64
	app.db.Model(&Store{}).Count(&stores)
	app.db.Model(&StoreStream{}).Count(&streams)
	app.db.Model(&InspectionPlan{}).Count(&plans)
	app.db.Model(&StorePlanBinding{}).Count(&bindings)
	app.db.Model(&InspectionJob{}).Count(&jobs)
	app.db.Model(&InspectionResult{}).Count(&results)
	success(ctx, gin.H{
		"stores":   stores,
		"streams":  streams,
		"plans":    plans,
		"bindings": bindings,
		"jobs":     jobs,
		"results":  results,
	})
}

func (app *App) listStores(ctx *gin.Context) {
	var items []Store
	query := strings.TrimSpace(ctx.Query("query"))
	db := app.db.Order("updated_at desc")
	if query != "" {
		db = db.Where("name LIKE ? OR code LIKE ?", "%"+query+"%", "%"+query+"%")
	}
	if err := db.Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, items)
}

func (app *App) createStore(ctx *gin.Context) {
	var payload Store
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	if payload.Status == "" {
		payload.Status = "enabled"
	}
	if err := app.db.Create(&payload).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, payload)
}

func (app *App) updateStore(ctx *gin.Context) {
	id, err := parseID(ctx, "id")
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid id")
		return
	}
	var payload Store
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	payload.ID = id
	if err := app.db.Model(&Store{ID: id}).Updates(map[string]interface{}{
		"name": payload.Name,
		"code": payload.Code,
		"alias_list": payload.AliasList,
		"region": payload.Region,
		"status": payload.Status,
		"manager_name": payload.ManagerName,
		"manager_wecom_user_id": payload.ManagerWecomUserID,
		"remark": payload.Remark,
	}).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	var item Store
	app.db.First(&item, id)
	success(ctx, item)
}

func (app *App) listStreams(ctx *gin.Context) {
	var items []StoreStream
	if err := app.db.Preload("Store").Order("updated_at desc").Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, items)
}

func (app *App) createStream(ctx *gin.Context) {
	var payload StoreStream
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	if err := app.db.Create(&payload).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	var item StoreStream
	app.db.Preload("Store").First(&item, payload.ID)
	success(ctx, item)
}

func (app *App) updateStream(ctx *gin.Context) {
	id, err := parseID(ctx, "id")
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid id")
		return
	}
	var payload StoreStream
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	if err := app.db.Model(&StoreStream{ID: id}).Updates(map[string]interface{}{
		"store_id": payload.StoreID,
		"name": payload.Name,
		"alias_list": payload.AliasList,
		"stream_url": payload.StreamURL,
		"stream_type": payload.StreamType,
		"source_alias": payload.SourceAlias,
		"baseline_image_url": payload.BaselineImageURL,
		"baseline_image_path": payload.BaselineImagePath,
		"enabled": payload.Enabled,
	}).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	var item StoreStream
	app.db.Preload("Store").First(&item, id)
	success(ctx, item)
}

func (app *App) listPlans(ctx *gin.Context) {
	var items []InspectionPlan
	if err := app.db.Order("updated_at desc").Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, items)
}

func (app *App) createPlan(ctx *gin.Context) {
	var payload InspectionPlan
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	if payload.FramePickMode == "" {
		payload.FramePickMode = "random"
	}
	if err := app.db.Create(&payload).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, payload)
}

func (app *App) updatePlan(ctx *gin.Context) {
	id, err := parseID(ctx, "id")
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid id")
		return
	}
	var payload InspectionPlan
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	if err := app.db.Model(&InspectionPlan{ID: id}).Updates(map[string]interface{}{
		"name": payload.Name,
		"code": payload.Code,
		"alias_list": payload.AliasList,
		"trigger_keywords": payload.TriggerKeywords,
		"plan_type": payload.PlanType,
		"description": payload.Description,
		"frame_pick_mode": payload.FramePickMode,
		"match_threshold_percent": payload.MatchThresholdPercent,
		"difference_threshold_percent": payload.DifferenceThresholdPercent,
		"enabled": payload.Enabled,
	}).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	var item InspectionPlan
	app.db.First(&item, id)
	success(ctx, item)
}

func (app *App) listPlanItems(ctx *gin.Context) {
	planID, err := parseID(ctx, "id")
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid plan id")
		return
	}
	var items []InspectionPlanItem
	if err := app.db.Where("plan_id = ?", planID).Order("sort_order asc, id asc").Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, items)
}

func (app *App) createPlanItem(ctx *gin.Context) {
	planID, err := parseID(ctx, "id")
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid plan id")
		return
	}
	var payload InspectionPlanItem
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	payload.PlanID = planID
	if err := app.db.Create(&payload).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, payload)
}

func (app *App) updatePlanItem(ctx *gin.Context) {
	id, err := parseID(ctx, "id")
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid id")
		return
	}
	var payload InspectionPlanItem
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	if err := app.db.Model(&InspectionPlanItem{ID: id}).Updates(map[string]interface{}{
		"item_type": payload.ItemType,
		"content": payload.Content,
		"sort_order": payload.SortOrder,
		"required": payload.Required,
		"enabled": payload.Enabled,
	}).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	var item InspectionPlanItem
	app.db.First(&item, id)
	success(ctx, item)
}

func (app *App) listBindings(ctx *gin.Context) {
	var items []StorePlanBinding
	if err := app.db.Preload("Store").Preload("Plan").Preload("Stream").Order("updated_at desc").Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, items)
}

func (app *App) createBinding(ctx *gin.Context) {
	var payload StorePlanBinding
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	if err := app.db.Create(&payload).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	var item StorePlanBinding
	app.db.Preload("Store").Preload("Plan").Preload("Stream").First(&item, payload.ID)
	success(ctx, item)
}

func (app *App) updateBinding(ctx *gin.Context) {
	id, err := parseID(ctx, "id")
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid id")
		return
	}
	var payload StorePlanBinding
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	if err := app.db.Model(&StorePlanBinding{ID: id}).Updates(map[string]interface{}{
		"store_id": payload.StoreID,
		"plan_id": payload.PlanID,
		"stream_id": payload.StreamID,
		"custom_match_threshold_percent": payload.CustomMatchThresholdPercent,
		"custom_difference_threshold_percent": payload.CustomDifferenceThresholdPercent,
		"enabled": payload.Enabled,
	}).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	var item StorePlanBinding
	app.db.Preload("Store").Preload("Plan").Preload("Stream").First(&item, id)
	success(ctx, item)
}

func (app *App) listJobs(ctx *gin.Context) {
	var items []InspectionJob
	if err := app.db.Preload("Store").Preload("Plan").Preload("Binding").Preload("Binding.Stream").Preload("Result").Order("created_at desc").Limit(200).Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, items)
}

func (app *App) getJob(ctx *gin.Context) {
	id, err := parseID(ctx, "id")
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid id")
		return
	}
	var item InspectionJob
	if err := app.db.Preload("Store").Preload("Plan").Preload("Binding").Preload("Binding.Stream").Preload("Result.Items").Preload("Result.Artifacts").First(&item, id).Error; err != nil {
		fail(ctx, http.StatusNotFound, "job not found")
		return
	}
	success(ctx, item)
}

func (app *App) getResult(ctx *gin.Context) {
	id, err := parseID(ctx, "id")
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid id")
		return
	}
	var item InspectionResult
	if err := app.db.Preload("Items").Preload("Artifacts").First(&item, id).Error; err != nil {
		fail(ctx, http.StatusNotFound, "result not found")
		return
	}
	success(ctx, item)
}

func (app *App) listSchedules(ctx *gin.Context) {
	var items []Schedule
	if err := app.db.Order("updated_at desc").Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, items)
}

func (app *App) createSchedule(ctx *gin.Context) {
	var payload Schedule
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	if err := app.db.Create(&payload).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, payload)
}

func (app *App) updateSchedule(ctx *gin.Context) {
	id, err := parseID(ctx, "id")
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid id")
		return
	}
	var payload Schedule
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	if err := app.db.Model(&Schedule{ID: id}).Updates(map[string]interface{}{
		"store_id": payload.StoreID,
		"plan_id": payload.PlanID,
		"cron_expr": payload.CronExpr,
		"enabled": payload.Enabled,
		"last_run_at": payload.LastRunAt,
		"next_run_at": payload.NextRunAt,
	}).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	var item Schedule
	app.db.First(&item, id)
	success(ctx, item)
}

func (app *App) executeContext(ctx *gin.Context) {
	var req executeContextRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	store, plan, binding, stream, items, alertRule, err := app.resolveExecutionContext(req)
	if err != nil {
		fail(ctx, http.StatusNotFound, err.Error())
		return
	}
	success(ctx, gin.H{
		"store": store,
		"stream": stream,
		"plan": plan,
		"items": items,
		"binding": binding,
		"alertRule": alertRule,
	})
}

func (app *App) createManualExecution(ctx *gin.Context) {
	var req manualExecutionRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	store, plan, binding, stream, items, alertRule, err := app.resolveExecutionContext(executeContextRequest{
		StoreID: req.StoreID,
		StoreName: req.StoreName,
		PlanID:  req.PlanID,
		PlanName: req.PlanName,
		Source: req.Source,
	})
	if err != nil {
		fail(ctx, http.StatusNotFound, err.Error())
		return
	}
	now := time.Now()
	job := InspectionJob{
		JobNo:              fmt.Sprintf("JOB-%s-%04d", now.Format("20060102150405"), time.Now().Nanosecond()%10000),
		StoreID:            store.ID,
		PlanID:             plan.ID,
		BindingID:          binding.ID,
		TriggerType:        valueOr(req.TriggerType, "manual"),
		TriggerSource:      req.TriggerSource,
		OperatorName:       req.OperatorName,
		OperatorWecomUserID: req.OperatorWecomUserID,
		Status:             "pending",
	}
	if err := app.db.Create(&job).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, gin.H{
		"job": job,
		"store": store,
		"stream": stream,
		"plan": plan,
		"items": items,
		"alertRule": alertRule,
	})
}

func (app *App) createInspectionResult(ctx *gin.Context) {
	var req inspectionResultCreateRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	var job InspectionJob
	if err := app.db.First(&job, req.JobID).Error; err != nil {
		fail(ctx, http.StatusNotFound, "job not found")
		return
	}

	result := InspectionResult{
		JobID:                      req.JobID,
		StoreName:                  req.StoreName,
		PlanName:                   req.PlanName,
		MonitorName:                req.MonitorName,
		Source:                     req.Source,
		InspectionType:             req.InspectionType,
		FramePickMode:              req.FramePickMode,
		SampledAtSeconds:           req.SampledAtSeconds,
		Verdict:                    req.Verdict,
		MatchPercent:               req.MatchPercent,
		DifferencePercent:          req.DifferencePercent,
		ObservedSummary:            req.ObservedSummary,
		FallbackUsed:               req.FallbackUsed,
		FallbackReason:             req.FallbackReason,
		PluginRecommendation:       req.PluginRecommendation,
		PluginRecommendationReason: req.PluginRecommendationReason,
		ReportURL:                  req.ReportURL,
		DocURL:                     req.DocURL,
	}

	err := app.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where(InspectionResult{JobID: req.JobID}).Delete(&InspectionResult{}).Error; err != nil {
			return err
		}
		if err := tx.Create(&result).Error; err != nil {
			return err
		}
		for _, item := range req.Items {
			item.ID = 0
			item.ResultID = result.ID
			if err := tx.Create(&item).Error; err != nil {
				return err
			}
		}
		for _, artifact := range req.Artifacts {
			artifact.ID = 0
			artifact.ResultID = result.ID
			if err := tx.Create(&artifact).Error; err != nil {
				return err
			}
		}
		now := time.Now()
		job.Status = statusFromVerdict(req.Verdict)
		job.FinishedAt = &now
		return tx.Model(&InspectionJob{ID: req.JobID}).Updates(map[string]interface{}{
			"status": job.Status,
			"finished_at": now,
			"error_message": "",
		}).Error
	})
	if err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}

	app.db.Preload("Items").Preload("Artifacts").First(&result, result.ID)
	success(ctx, result)
}

func (app *App) resolveExecutionContext(req executeContextRequest) (Store, InspectionPlan, StorePlanBinding, StoreStream, []InspectionPlanItem, AlertRule, error) {
	var store Store
	var plan InspectionPlan
	planQuery := strings.TrimSpace(req.PlanName)

	if req.StoreID > 0 {
		if err := app.db.First(&store, req.StoreID).Error; err != nil {
			return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, errors.New("门店不存在")
		}
	} else if strings.TrimSpace(req.StoreName) != "" {
		resolvedStore, err := app.findStoreByNameLike(strings.TrimSpace(req.StoreName))
		if err != nil {
			return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, err
		}
		store = resolvedStore
	} else if strings.TrimSpace(req.Source) != "" {
		var stream StoreStream
		err := app.db.Preload("Store").Where("stream_url = ? OR source_alias = ?", strings.TrimSpace(req.Source), strings.TrimSpace(req.Source)).First(&stream).Error
		if err != nil {
			return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, errors.New("未找到对应流媒体")
		}
		store = stream.Store
	}

	if req.PlanID > 0 {
		if err := app.db.First(&plan, req.PlanID).Error; err != nil {
			return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, errors.New("巡检计划不存在")
		}
	} else if planQuery != "" {
		if store.ID > 0 {
			resolvedPlan, err := app.findPlanForStore(store, planQuery, strings.TrimSpace(req.StoreName))
			if err != nil {
				return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, err
			}
			plan = resolvedPlan
		} else {
			resolvedPlan, err := app.findPlanByNameLike(planQuery)
			if err != nil {
				return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, err
			}
			plan = resolvedPlan
		}
	} else {
		if err := app.db.Where("enabled = ?", true).Order("id asc").First(&plan).Error; err != nil {
			return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, errors.New("没有可用巡检计划")
		}
	}

	var binding StorePlanBinding
	err := app.db.Preload("Store").Preload("Plan").Preload("Stream").Where("store_id = ? AND plan_id = ? AND enabled = ?", store.ID, plan.ID, true).First(&binding).Error
	if err != nil && strings.TrimSpace(req.Source) != "" {
		err = app.db.Preload("Store").Preload("Plan").Preload("Stream").
			Joins("JOIN store_streams ON store_streams.id = store_plan_bindings.stream_id").
			Where("store_plan_bindings.plan_id = ? AND store_plan_bindings.enabled = ? AND (store_streams.stream_url = ? OR store_streams.source_alias = ?)", plan.ID, true, strings.TrimSpace(req.Source), strings.TrimSpace(req.Source)).
			First(&binding).Error
	}
	if err != nil {
		return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, errors.New("门店未绑定对应巡检计划")
	}

	var items []InspectionPlanItem
	if err := app.db.Where("plan_id = ? AND enabled = ?", plan.ID, true).Order("sort_order asc, id asc").Find(&items).Error; err != nil {
		return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, err
	}

	var alertRule AlertRule
	_ = app.db.Where("store_id = ? AND plan_id = ? AND enabled = ?", binding.StoreID, binding.PlanID, true).First(&alertRule).Error

	if binding.CustomMatchThresholdPercent > 0 {
		plan.MatchThresholdPercent = binding.CustomMatchThresholdPercent
	}
	if binding.CustomDifferenceThresholdPercent > 0 {
		plan.DifferenceThresholdPercent = binding.CustomDifferenceThresholdPercent
	}

	return binding.Store, plan, binding, binding.Stream, items, alertRule, nil
}

func valueOr(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func normalizeLookupToken(value string) string {
	var builder strings.Builder
	builder.Grow(len(value))
	for _, r := range strings.TrimSpace(strings.ToLower(value)) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			builder.WriteRune(r)
		}
	}
	return builder.String()
}

func dedupeLookupValues(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		text := strings.TrimSpace(value)
		key := normalizeLookupToken(text)
		if text == "" || key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, text)
	}
	return result
}

func splitLookupValues(raw string) []string {
	parts := strings.FieldsFunc(raw, func(r rune) bool {
		switch r {
		case ',', '，', ';', '；', '\n', '\r', '\t', '|', '、':
			return true
		default:
			return false
		}
	})
	return dedupeLookupValues(parts)
}

func expandAliasCandidates(value string, aliasMap map[string][]string) []string {
	text := strings.TrimSpace(value)
	if text == "" {
		return nil
	}
	query := normalizeLookupToken(text)
	candidates := []string{text}
	for canonical, aliases := range aliasMap {
		canonicalKey := normalizeLookupToken(canonical)
		matched := canonicalKey != "" && (query == canonicalKey || strings.Contains(query, canonicalKey) || strings.Contains(canonicalKey, query))
		if !matched {
			for _, alias := range aliases {
				aliasKey := normalizeLookupToken(alias)
				if aliasKey == "" {
					continue
				}
				if query == aliasKey || strings.Contains(query, aliasKey) || strings.Contains(aliasKey, query) {
					matched = true
					break
				}
			}
		}
		if matched {
			candidates = append(candidates, canonical)
			candidates = append(candidates, aliases...)
		}
	}
	return dedupeLookupValues(candidates)
}

func longestCommonSubsequenceLength(left string, right string) int {
	leftRunes := []rune(left)
	rightRunes := []rune(right)
	if len(leftRunes) == 0 || len(rightRunes) == 0 {
		return 0
	}
	dp := make([]int, len(rightRunes)+1)
	for i := 1; i <= len(leftRunes); i++ {
		prev := 0
		for j := 1; j <= len(rightRunes); j++ {
			current := dp[j]
			if leftRunes[i-1] == rightRunes[j-1] {
				dp[j] = prev + 1
			} else if dp[j-1] > dp[j] {
				dp[j] = dp[j-1]
			}
			prev = current
		}
	}
	return dp[len(rightRunes)]
}

func scoreLookupCandidate(query string, candidate string) int {
	normalizedQuery := normalizeLookupToken(query)
	normalizedCandidate := normalizeLookupToken(candidate)
	if normalizedQuery == "" || normalizedCandidate == "" {
		return 0
	}
	if normalizedQuery == normalizedCandidate {
		return 1000 + len([]rune(normalizedCandidate))
	}
	if strings.Contains(normalizedQuery, normalizedCandidate) {
		return 800 + len([]rune(normalizedCandidate))
	}
	if strings.Contains(normalizedCandidate, normalizedQuery) {
		return 500 + len([]rune(normalizedQuery))
	}
	lcs := longestCommonSubsequenceLength(normalizedQuery, normalizedCandidate)
	longest := len([]rune(normalizedQuery))
	if candidateLen := len([]rune(normalizedCandidate)); candidateLen > longest {
		longest = candidateLen
	}
	if lcs == 0 || longest == 0 {
		return 0
	}
	ratio := float64(lcs) / float64(longest)
	if ratio < 0.6 {
		return 0
	}
	return 200 + int(ratio*100) + lcs*10
}

func inferPlanTypeHint(planName string, storeName string) string {
	normalizedPlan := normalizeLookupToken(planName)
	normalizedStore := normalizeLookupToken(storeName)
	if normalizedPlan == "" {
		return ""
	}
	if strings.Contains(normalizedPlan, normalizeLookupToken("基准图")) || strings.Contains(normalizedPlan, normalizeLookupToken("图片")) || strings.Contains(normalizedPlan, normalizeLookupToken("相似度")) {
		return "baseline_inspection"
	}
	if strings.Contains(normalizedPlan, normalizeLookupToken("实时检查")) || strings.Contains(normalizedPlan, normalizeLookupToken("点检")) || strings.Contains(normalizedPlan, normalizeLookupToken("巡场")) || strings.Contains(normalizedPlan, normalizeLookupToken("营业画面")) {
		return "description_inspection"
	}
	if normalizedStore != "" && normalizedPlan == normalizedStore {
		return "description_inspection"
	}
	return ""
}

func storeLookupCandidates(store Store) []string {
	values := []string{store.Name, store.Code}
	values = append(values, splitLookupValues(store.AliasList)...)
	if aliases, ok := storeAliasMap[strings.TrimSpace(store.Name)]; ok {
		values = append(values, aliases...)
	}
	return dedupeLookupValues(values)
}

func planLookupCandidates(plan InspectionPlan) []string {
	values := []string{plan.Name, plan.Code}
	values = append(values, splitLookupValues(plan.AliasList)...)
	values = append(values, splitLookupValues(plan.TriggerKeywords)...)
	switch strings.TrimSpace(plan.PlanType) {
	case "baseline_inspection":
		values = append(values, "门店基准图巡检", "基准图巡检", "图片基准巡检")
	case "description_inspection":
		values = append(values, "营业画面点检", "点检项巡检", "实时检查计划", "文字巡检计划")
	}
	return dedupeLookupValues(values)
}

func containsInspectionKeywords(value string) bool {
	normalized := normalizeLookupToken(value)
	if normalized == "" {
		return false
	}
	keywords := []string{"实时检查", "点检", "巡检", "巡场", "营业画面", "计划"}
	for _, keyword := range keywords {
		if strings.Contains(normalized, normalizeLookupToken(keyword)) {
			return true
		}
	}
	return false
}

func formatNameList(values []string) string {
	items := dedupeLookupValues(values)
	if len(items) == 0 {
		return ""
	}
	if len(items) > 5 {
		items = items[:5]
	}
	return strings.Join(items, "、")
}

func (app *App) findStoreByNameLike(name string) (Store, error) {
	query := strings.TrimSpace(name)
	if query == "" {
		return Store{}, errors.New("门店名称不能为空")
	}
	var exact Store
	if err := app.db.Where("name = ? OR code = ?", query, query).First(&exact).Error; err == nil {
		return exact, nil
	}

	var stores []Store
	if err := app.db.Find(&stores).Error; err != nil {
		return Store{}, err
	}
	bestScore := 0
	var best Store
	queryCandidates := expandAliasCandidates(query, storeAliasMap)
	for _, store := range stores {
		candidates := storeLookupCandidates(store)
		for _, queryCandidate := range queryCandidates {
			for _, candidate := range candidates {
				score := scoreLookupCandidate(queryCandidate, candidate)
				if score > bestScore {
					bestScore = score
					best = store
				}
			}
		}
	}
	if best.ID > 0 && bestScore >= 500 {
		return best, nil
	}
	storeNames := make([]string, 0, len(stores))
	for _, store := range stores {
		storeNames = append(storeNames, store.Name)
	}
	return Store{}, fmt.Errorf("未命中门店「%s」，当前可用门店: %s", query, formatNameList(storeNames))
}

func (app *App) findPlanByNameExact(name string) (InspectionPlan, error) {
	query := strings.TrimSpace(name)
	if query == "" {
		return InspectionPlan{}, errors.New("巡检计划名称不能为空")
	}

	var exact InspectionPlan
	if err := app.db.Where("enabled = ? AND (name = ? OR code = ?)", true, query, query).First(&exact).Error; err == nil {
		return exact, nil
	}

	var plans []InspectionPlan
	if err := app.db.Where("enabled = ?", true).Find(&plans).Error; err != nil {
		return InspectionPlan{}, err
	}

	normalizedQuery := normalizeLookupToken(query)
	for _, candidate := range plans {
		for _, lookup := range planLookupCandidates(candidate) {
			if normalizeLookupToken(lookup) == normalizedQuery && normalizedQuery != "" {
				return candidate, nil
			}
		}
	}

	return InspectionPlan{}, gorm.ErrRecordNotFound
}

func (app *App) findPlanByNameLike(name string) (InspectionPlan, error) {
	query := strings.TrimSpace(name)
	if query == "" {
		return InspectionPlan{}, errors.New("巡检计划名称不能为空")
	}

	if exact, err := app.findPlanByNameExact(query); err == nil {
		return exact, nil
	}

	var plans []InspectionPlan
	if err := app.db.Where("enabled = ?", true).Find(&plans).Error; err != nil {
		return InspectionPlan{}, err
	}
	bestScore := 0
	var best InspectionPlan
	for _, candidate := range plans {
		score := 0
		for _, lookup := range planLookupCandidates(candidate) {
			candidateScore := scoreLookupCandidate(query, lookup)
			if candidateScore > score {
				score = candidateScore
			}
		}
		if score > bestScore {
			bestScore = score
			best = candidate
		}
	}
	if best.ID > 0 && bestScore >= 260 {
		return best, nil
	}

	planNames := make([]string, 0, len(plans))
	for _, candidate := range plans {
		planNames = append(planNames, candidate.Name)
	}
	return InspectionPlan{}, fmt.Errorf("未命中巡检计划「%s」，当前可用计划: %s", query, formatNameList(planNames))
}

func (app *App) listBoundPlans(storeID uint) ([]InspectionPlan, error) {
	var plans []InspectionPlan
	err := app.db.Model(&InspectionPlan{}).
		Distinct("inspection_plans.id, inspection_plans.name, inspection_plans.code, inspection_plans.plan_type, inspection_plans.description, inspection_plans.frame_pick_mode, inspection_plans.match_threshold_percent, inspection_plans.difference_threshold_percent, inspection_plans.enabled, inspection_plans.created_at, inspection_plans.updated_at").
		Joins("JOIN store_plan_bindings ON store_plan_bindings.plan_id = inspection_plans.id AND store_plan_bindings.enabled = ?", true).
		Where("store_plan_bindings.store_id = ? AND inspection_plans.enabled = ?", storeID, true).
		Order("inspection_plans.id ASC").
		Find(&plans).Error
	return plans, err
}

func (app *App) findBindingByStoreAndPlan(storeID uint, planID uint) (StorePlanBinding, error) {
	var binding StorePlanBinding
	err := app.db.Preload("Store").Preload("Plan").Preload("Stream").
		Where("store_id = ? AND plan_id = ? AND enabled = ?", storeID, planID, true).
		First(&binding).Error
	return binding, err
}

func (app *App) findPlanForStore(store Store, requestedPlanName string, requestedStoreName string) (InspectionPlan, error) {
	query := strings.TrimSpace(requestedPlanName)
	if query == "" {
		return InspectionPlan{}, errors.New("巡检计划名称不能为空")
	}

	if exactPlan, err := app.findPlanByNameExact(query); err == nil {
		if _, bindingErr := app.findBindingByStoreAndPlan(store.ID, exactPlan.ID); bindingErr == nil {
			return exactPlan, nil
		}
		return InspectionPlan{}, fmt.Errorf("门店「%s」未绑定巡检计划「%s」，请先在后台绑定后再执行", store.Name, exactPlan.Name)
	}

	return app.findBoundPlanByNameLike(store, query, requestedStoreName)
}

func (app *App) findBoundPlanByNameLike(store Store, requestedPlanName string, requestedStoreName string) (InspectionPlan, error) {
	query := strings.TrimSpace(requestedPlanName)
	if query == "" {
		return InspectionPlan{}, errors.New("巡检计划名称不能为空")
	}
	plans, err := app.listBoundPlans(store.ID)
	if err != nil {
		return InspectionPlan{}, err
	}
	if len(plans) == 0 {
		return InspectionPlan{}, fmt.Errorf("门店「%s」暂无已绑定的巡检计划", store.Name)
	}
	planTypeHint := inferPlanTypeHint(query, requestedStoreName)
	queryCandidates := dedupeLookupValues([]string{query})
	bestScore := 0
	var best InspectionPlan
	for _, plan := range plans {
		score := 0
		for _, queryCandidate := range queryCandidates {
			for _, candidate := range planLookupCandidates(plan) {
				candidateScore := scoreLookupCandidate(queryCandidate, candidate)
				if candidateScore > score {
					score = candidateScore
				}
			}
		}
		if planTypeHint != "" && strings.TrimSpace(plan.PlanType) == planTypeHint {
			score += 120
		}
		if normalizeLookupToken(query) == normalizeLookupToken(requestedStoreName) && strings.TrimSpace(plan.PlanType) == "description_inspection" {
			score += 160
		}
		if strings.TrimSpace(plan.PlanType) == "description_inspection" && containsInspectionKeywords(plan.Name) {
			score += 40
		}
		if score > bestScore {
			bestScore = score
			best = plan
		}
	}
	if best.ID > 0 && bestScore >= 260 {
		return best, nil
	}
	planNames := make([]string, 0, len(plans))
	for _, plan := range plans {
		planNames = append(planNames, plan.Name)
	}
	return InspectionPlan{}, fmt.Errorf("门店「%s」未命中巡检计划「%s」，当前可用计划: %s", store.Name, query, formatNameList(planNames))
}

func statusFromVerdict(verdict string) string {
	switch strings.TrimSpace(verdict) {
	case "pass":
		return "success"
	case "violation":
		return "alerted"
	default:
		return "partial_success"
	}
}

func firstOrCreate[T any](db *gorm.DB, value *T, conds ...interface{}) error {
	return db.Clauses(clause.OnConflict{DoNothing: true}).FirstOrCreate(value, conds...).Error
}

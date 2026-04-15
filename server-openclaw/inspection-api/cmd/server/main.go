package main

import (
	"errors"
	"fmt"
	"math/rand"
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
	Priority                     int            `json:"priority"`
	CustomMatchThresholdPercent  float64        `json:"customMatchThresholdPercent"`
	CustomDifferenceThresholdPercent float64    `json:"customDifferenceThresholdPercent"`
	Enabled                      bool           `json:"enabled"`
	CreatedAt                    time.Time      `json:"createdAt"`
	UpdatedAt                    time.Time      `json:"updatedAt"`
}

type InspectionMatchLog struct {
	ID                 uint       `json:"id" gorm:"primaryKey"`
	JobID              *uint      `json:"jobId"`
	QueryText          string     `json:"queryText"`
	NormalizedQuery    string     `json:"normalizedQuery"`
	RequestedStoreName string     `json:"requestedStoreName"`
	RequestedPlanName  string     `json:"requestedPlanName"`
	RequestedStreamName string    `json:"requestedStreamName"`
	RequestedSource    string     `json:"requestedSource"`
	MatchedStoreID     uint       `json:"matchedStoreId"`
	MatchedStoreName   string     `json:"matchedStoreName"`
	MatchedPlanID      uint       `json:"matchedPlanId"`
	MatchedPlanName    string     `json:"matchedPlanName"`
	MatchedStreamID    uint       `json:"matchedStreamId"`
	MatchedStreamName  string     `json:"matchedStreamName"`
	MatchedBindingID   uint       `json:"matchedBindingId"`
	StoreMatchMode     string     `json:"storeMatchMode"`
	PlanMatchMode      string     `json:"planMatchMode"`
	StreamMatchMode    string     `json:"streamMatchMode"`
	BindingMatchMode   string     `json:"bindingMatchMode"`
	ConfidenceScore    int        `json:"confidenceScore"`
	ConfigVersion      string     `json:"configVersion"`
	DecisionSummary    string     `json:"decisionSummary"`
	ErrorMessage       string     `json:"errorMessage"`
	CreatedAt          time.Time  `json:"createdAt"`
}

type InspectionJob struct {
	ID               uint       `json:"id" gorm:"primaryKey"`
	JobNo            string     `json:"jobNo"`
	BatchID          *uint      `json:"batchId"`
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

type BatchExecutionRun struct {
	ID                 uint            `json:"id" gorm:"primaryKey"`
	BatchNo            string          `json:"batchNo"`
	ScopeType          string          `json:"scopeType"`
	ScopeValue         string          `json:"scopeValue"`
	OperatorName       string          `json:"operatorName"`
	OperatorWecomUserID string         `json:"operatorWecomUserId"`
	OwnerName          string          `json:"ownerName"`
	OwnerWecomUserID   string          `json:"ownerWecomUserId"`
	OwnerSource        string          `json:"ownerSource"`
	TriggerSource      string          `json:"triggerSource"`
	PlanID             uint            `json:"planId"`
	Plan               InspectionPlan  `json:"plan"`
	PlanName           string          `json:"planName"`
	ExecutionMode      string          `json:"executionMode"`
	SampleSize         int             `json:"sampleSize"`
	SelectedStoreCount int             `json:"selectedStoreCount"`
	MatchedStoreCount  int             `json:"matchedStoreCount"`
	TotalJobs          int             `json:"totalJobs"`
	PendingJobs        int             `json:"pendingJobs"`
	RunningJobs        int             `json:"runningJobs"`
	SuccessJobs        int             `json:"successJobs"`
	AlertedJobs        int             `json:"alertedJobs"`
	PartialSuccessJobs int             `json:"partialSuccessJobs"`
	ErrorJobs          int             `json:"errorJobs"`
	Status             string          `json:"status"`
	SummaryText        string          `json:"summaryText"`
	FinishedAt         *time.Time      `json:"finishedAt"`
	CreatedAt          time.Time       `json:"createdAt"`
	UpdatedAt          time.Time       `json:"updatedAt"`
	Jobs               []InspectionJob `json:"jobs,omitempty" gorm:"foreignKey:BatchID"`
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
	StreamName string `json:"streamName"`
	Source    string `json:"source"`
	RawQuery  string `json:"rawQuery"`
}

type manualExecutionRequest struct {
	StoreID            uint   `json:"storeId"`
	StoreName          string `json:"storeName"`
	PlanID             uint   `json:"planId"`
	PlanName           string `json:"planName"`
	StreamName         string `json:"streamName"`
	Source             string `json:"source"`
	RawQuery           string `json:"rawQuery"`
	OperatorName       string `json:"operatorName"`
	OperatorWecomUserID string `json:"operatorWecomUserId"`
	TriggerType        string `json:"triggerType"`
	TriggerSource      string `json:"triggerSource"`
}

type batchExecutionRequest struct {
	StoreIDs            []uint `json:"storeIds"`
	Region              string `json:"region"`
	ManagerName         string `json:"managerName"`
	ManagerWecomUserID  string `json:"managerWecomUserId"`
	OwnerName           string `json:"ownerName"`
	OwnerWecomUserID    string `json:"ownerWecomUserId"`
	OwnerSource         string `json:"ownerSource"`
	PlanID              uint   `json:"planId"`
	PlanName            string `json:"planName"`
	OperatorName        string `json:"operatorName"`
	OperatorWecomUserID string `json:"operatorWecomUserId"`
	TriggerSource       string `json:"triggerSource"`
	ExecutionMode       string `json:"executionMode"`
	SampleSize          int    `json:"sampleSize"`
}

type inspectionJobFailureRequest struct {
	ErrorMessage string `json:"errorMessage"`
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

type matchCandidate struct {
	Mode        string
	Score       int
	Candidate   string
	Explanation string
}

type rankedOption struct {
	Label string
	Score int
}

type resolveTrace struct {
	QueryText       string
	StoreMatch      matchCandidate
	PlanMatch       matchCandidate
	StreamMatch     matchCandidate
	BindingMatch    matchCandidate
	ConfigVersion   string
	DecisionSummary string
	ErrorMessage    string
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
		api.GET("/meta/config-version", app.getConfigVersion)

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
		api.POST("/inspection-jobs/:id/start", app.startJob)
		api.POST("/inspection-jobs/:id/fail", app.failJob)
		api.GET("/batch-execution-runs", app.listBatchExecutionRuns)
		api.GET("/batch-execution-runs/:id", app.getBatchExecutionRun)
		api.POST("/batch-execution-runs/:id/retry-failed", app.retryFailedBatchExecutionRun)
		api.GET("/inspection-results/:id", app.getResult)
		api.GET("/inspection-match-logs", app.listMatchLogs)

		api.GET("/schedules", app.listSchedules)
		api.POST("/schedules", app.createSchedule)
		api.PUT("/schedules/:id", app.updateSchedule)

		api.POST("/execute/context", app.executeContext)
		api.POST("/manual-executions", app.createManualExecution)
		api.POST("/batch-executions/estimate", app.estimateBatchExecution)
		api.POST("/batch-executions", app.createBatchExecution)
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
		&BatchExecutionRun{},
		&InspectionResult{},
		&InspectionResultItem{},
		&InspectionArtifact{},
		&InspectionMatchLog{},
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
		Priority:                         40,
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
		Priority:                    100,
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
		Priority:                    70,
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
		"priority":                             payload.Priority,
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

func parsePagination(ctx *gin.Context, defaultPageSize int, maxPageSize int) (int, int, bool) {
	page := 1
	pageSize := defaultPageSize
	all := strings.EqualFold(strings.TrimSpace(ctx.Query("all")), "true") || strings.TrimSpace(ctx.Query("all")) == "1"
	if rawPage := strings.TrimSpace(ctx.Query("page")); rawPage != "" {
		if parsed, err := strconv.Atoi(rawPage); err == nil && parsed > 0 {
			page = parsed
		}
	}
	if rawPageSize := strings.TrimSpace(ctx.Query("pageSize")); rawPageSize != "" {
		if parsed, err := strconv.Atoi(rawPageSize); err == nil && parsed > 0 {
			pageSize = parsed
		}
	}
	if maxPageSize > 0 && pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	if all {
		page = 1
	}
	return page, pageSize, all
}

func buildPaginatedPayload(items interface{}, total int64, page int, pageSize int) gin.H {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 1
	}
	return gin.H{
		"items":    items,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	}
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

func (app *App) getConfigVersion(ctx *gin.Context) {
	success(ctx, gin.H{"version": app.currentConfigVersion()})
}

func (app *App) listStores(ctx *gin.Context) {
	var items []Store
	query := strings.TrimSpace(ctx.Query("query"))
	page, pageSize, all := parsePagination(ctx, 10, 200)
	db := app.db.Model(&Store{})
	if query != "" {
		db = db.Where("name LIKE ? OR code LIKE ?", "%"+query+"%", "%"+query+"%")
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	queryDB := db.Order("updated_at desc")
	if !all {
		queryDB = queryDB.Offset((page - 1) * pageSize).Limit(pageSize)
	}
	if err := queryDB.Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	if all {
		pageSize = len(items)
		if pageSize == 0 {
			pageSize = 1
		}
	}
	success(ctx, buildPaginatedPayload(items, total, page, pageSize))
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
	page, pageSize, all := parsePagination(ctx, 10, 200)
	db := app.db.Model(&StoreStream{})
	if storeID, err := parseOptionalUint(ctx.Query("storeId")); err != nil {
		fail(ctx, http.StatusBadRequest, "invalid store id")
		return
	} else if storeID > 0 {
		db = db.Where("store_id = ?", storeID)
	}
	query := strings.TrimSpace(ctx.Query("query"))
	if query != "" {
		like := "%" + query + "%"
		db = db.Where("name LIKE ? OR alias_list LIKE ? OR stream_url LIKE ? OR source_alias LIKE ?", like, like, like, like)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	queryDB := app.db.Preload("Store").Model(&StoreStream{})
	if storeID, _ := parseOptionalUint(ctx.Query("storeId")); storeID > 0 {
		queryDB = queryDB.Where("store_id = ?", storeID)
	}
	if query != "" {
		like := "%" + query + "%"
		queryDB = queryDB.Where("name LIKE ? OR alias_list LIKE ? OR stream_url LIKE ? OR source_alias LIKE ?", like, like, like, like)
	}
	queryDB = queryDB.Order("updated_at desc")
	if !all {
		queryDB = queryDB.Offset((page - 1) * pageSize).Limit(pageSize)
	}
	if err := queryDB.Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	if all {
		pageSize = len(items)
		if pageSize == 0 {
			pageSize = 1
		}
	}
	success(ctx, buildPaginatedPayload(items, total, page, pageSize))
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
	page, pageSize, all := parsePagination(ctx, 10, 200)
	db := app.db.Model(&InspectionPlan{})
	query := strings.TrimSpace(ctx.Query("query"))
	if query != "" {
		like := "%" + query + "%"
		db = db.Where("name LIKE ? OR code LIKE ? OR alias_list LIKE ? OR trigger_keywords LIKE ?", like, like, like, like)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	queryDB := db.Order("updated_at desc")
	if !all {
		queryDB = queryDB.Offset((page - 1) * pageSize).Limit(pageSize)
	}
	if err := queryDB.Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	if all {
		pageSize = len(items)
		if pageSize == 0 {
			pageSize = 1
		}
	}
	success(ctx, buildPaginatedPayload(items, total, page, pageSize))
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
	page, pageSize, all := parsePagination(ctx, 10, 200)
	db := app.db.Model(&InspectionPlanItem{}).Where("plan_id = ?", planID)
	var total int64
	if err := db.Count(&total).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	queryDB := db.Order("sort_order asc, id asc")
	if !all {
		queryDB = queryDB.Offset((page - 1) * pageSize).Limit(pageSize)
	}
	if err := queryDB.Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	if all {
		pageSize = len(items)
		if pageSize == 0 {
			pageSize = 1
		}
	}
	success(ctx, buildPaginatedPayload(items, total, page, pageSize))
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
	page, pageSize, all := parsePagination(ctx, 10, 200)
	db := app.db.Model(&StorePlanBinding{})
	if storeID, err := parseOptionalUint(ctx.Query("storeId")); err != nil {
		fail(ctx, http.StatusBadRequest, "invalid store id")
		return
	} else if storeID > 0 {
		db = db.Where("store_id = ?", storeID)
	}
	if planID, err := parseOptionalUint(ctx.Query("planId")); err != nil {
		fail(ctx, http.StatusBadRequest, "invalid plan id")
		return
	} else if planID > 0 {
		db = db.Where("plan_id = ?", planID)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	queryDB := app.db.Preload("Store").Preload("Plan").Preload("Stream").Model(&StorePlanBinding{})
	if storeID, _ := parseOptionalUint(ctx.Query("storeId")); storeID > 0 {
		queryDB = queryDB.Where("store_id = ?", storeID)
	}
	if planID, _ := parseOptionalUint(ctx.Query("planId")); planID > 0 {
		queryDB = queryDB.Where("plan_id = ?", planID)
	}
	queryDB = queryDB.Order("priority desc, updated_at desc")
	if !all {
		queryDB = queryDB.Offset((page - 1) * pageSize).Limit(pageSize)
	}
	if err := queryDB.Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	if all {
		pageSize = len(items)
		if pageSize == 0 {
			pageSize = 1
		}
	}
	success(ctx, buildPaginatedPayload(items, total, page, pageSize))
}

func (app *App) createBinding(ctx *gin.Context) {
	var payload StorePlanBinding
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	if payload.Priority == 0 {
		payload.Priority = 100
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
		"priority": payload.Priority,
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
	page, pageSize, all := parsePagination(ctx, 10, 500)
	if rawLimit := strings.TrimSpace(ctx.Query("limit")); rawLimit != "" {
		if parsed, err := strconv.Atoi(rawLimit); err == nil && parsed > 0 && parsed <= 500 {
			pageSize = parsed
			page = 1
		}
	}
	var items []InspectionJob
	db := app.db.Model(&InspectionJob{})
	if status := strings.TrimSpace(ctx.Query("status")); status != "" {
		db = db.Where("status = ?", status)
	}
	if triggerSource := strings.TrimSpace(ctx.Query("triggerSource")); triggerSource != "" {
		db = db.Where("trigger_source = ?", triggerSource)
	}
	if batchIDText := strings.TrimSpace(ctx.Query("batchId")); batchIDText != "" {
		if batchID, err := strconv.ParseUint(batchIDText, 10, 64); err == nil && batchID > 0 {
			db = db.Where("batch_id = ?", batchID)
		}
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	queryDB := app.db.Preload("Store").Preload("Plan").Preload("Binding").Preload("Binding.Stream").Preload("Result").Model(&InspectionJob{})
	if status := strings.TrimSpace(ctx.Query("status")); status != "" {
		queryDB = queryDB.Where("status = ?", status)
	}
	if triggerSource := strings.TrimSpace(ctx.Query("triggerSource")); triggerSource != "" {
		queryDB = queryDB.Where("trigger_source = ?", triggerSource)
	}
	if batchIDText := strings.TrimSpace(ctx.Query("batchId")); batchIDText != "" {
		if batchID, err := strconv.ParseUint(batchIDText, 10, 64); err == nil && batchID > 0 {
			queryDB = queryDB.Where("batch_id = ?", batchID)
		}
	}
	queryDB = queryDB.Order("created_at desc")
	if !all {
		queryDB = queryDB.Offset((page - 1) * pageSize).Limit(pageSize)
	}
	if err := queryDB.Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	if all {
		pageSize = len(items)
		if pageSize == 0 {
			pageSize = 1
		}
	}
	success(ctx, buildPaginatedPayload(items, total, page, pageSize))
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

func (app *App) startJob(ctx *gin.Context) {
	id, err := parseID(ctx, "id")
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid id")
		return
	}
	now := time.Now()
	result := app.db.Model(&InspectionJob{}).
		Where("id = ? AND status = ?", id, "pending").
		Updates(map[string]interface{}{
			"status":        "running",
			"started_at":    now,
			"finished_at":   nil,
			"error_message": "",
		})
	if result.Error != nil {
		fail(ctx, http.StatusInternalServerError, result.Error.Error())
		return
	}
	if result.RowsAffected == 0 {
		var existing InspectionJob
		if err := app.db.Preload("Store").Preload("Plan").Preload("Binding").Preload("Binding.Stream").Preload("Result").First(&existing, id).Error; err != nil {
			fail(ctx, http.StatusNotFound, "job not found")
			return
		}
		fail(ctx, http.StatusConflict, fmt.Sprintf("任务当前状态为 %s，无法重复启动", existing.Status))
		return
	}
	var item InspectionJob
	if err := app.db.Preload("Store").Preload("Plan").Preload("Binding").Preload("Binding.Stream").Preload("Result").First(&item, id).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	app.refreshBatchForJob(item)
	success(ctx, item)
}

func (app *App) failJob(ctx *gin.Context) {
	id, err := parseID(ctx, "id")
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid id")
		return
	}
	var payload inspectionJobFailureRequest
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	now := time.Now()
	result := app.db.Model(&InspectionJob{}).
		Where("id = ? AND status IN ?", id, []string{"pending", "running"}).
		Updates(map[string]interface{}{
			"status":        "error",
			"finished_at":   now,
			"error_message": strings.TrimSpace(payload.ErrorMessage),
		})
	if result.Error != nil {
		fail(ctx, http.StatusInternalServerError, result.Error.Error())
		return
	}
	if result.RowsAffected == 0 {
		var existing InspectionJob
		if err := app.db.First(&existing, id).Error; err != nil {
			fail(ctx, http.StatusNotFound, "job not found")
			return
		}
		fail(ctx, http.StatusConflict, fmt.Sprintf("任务当前状态为 %s，无法写入失败结果", existing.Status))
		return
	}
	var item InspectionJob
	if err := app.db.Preload("Store").Preload("Plan").Preload("Binding").Preload("Binding.Stream").Preload("Result").First(&item, id).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	app.refreshBatchForJob(item)
	success(ctx, item)
}

func (app *App) listBatchExecutionRuns(ctx *gin.Context) {
	page, pageSize, all := parsePagination(ctx, 10, 200)
	if rawLimit := strings.TrimSpace(ctx.Query("limit")); rawLimit != "" {
		if parsed, err := strconv.Atoi(rawLimit); err == nil && parsed > 0 && parsed <= 200 {
			pageSize = parsed
			page = 1
		}
	}
	var items []BatchExecutionRun
	db := app.db.Model(&BatchExecutionRun{})
	if status := strings.TrimSpace(ctx.Query("status")); status != "" {
		db = db.Where("status = ?", status)
	}
	if managerWecomUserID := strings.TrimSpace(ctx.Query("managerWecomUserId")); managerWecomUserID != "" {
		db = db.Where("(owner_wecom_user_id = ?) OR (scope_type = ? AND scope_value LIKE ?)", managerWecomUserID, "manager", "%"+managerWecomUserID+"%")
	}
	if ownerWecomUserID := strings.TrimSpace(ctx.Query("ownerWecomUserId")); ownerWecomUserID != "" {
		db = db.Where("(owner_wecom_user_id = ?) OR (scope_type = ? AND scope_value LIKE ?)", ownerWecomUserID, "manager", "%"+ownerWecomUserID+"%")
	}
	if ownerName := strings.TrimSpace(ctx.Query("ownerName")); ownerName != "" {
		db = db.Where("(owner_name = ?) OR (scope_type = ? AND scope_value LIKE ?)", ownerName, "manager", "%"+ownerName+"%")
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	queryDB := app.db.Preload("Plan").Model(&BatchExecutionRun{})
	if status := strings.TrimSpace(ctx.Query("status")); status != "" {
		queryDB = queryDB.Where("status = ?", status)
	}
	if managerWecomUserID := strings.TrimSpace(ctx.Query("managerWecomUserId")); managerWecomUserID != "" {
		queryDB = queryDB.Where("(owner_wecom_user_id = ?) OR (scope_type = ? AND scope_value LIKE ?)", managerWecomUserID, "manager", "%"+managerWecomUserID+"%")
	}
	if ownerWecomUserID := strings.TrimSpace(ctx.Query("ownerWecomUserId")); ownerWecomUserID != "" {
		queryDB = queryDB.Where("(owner_wecom_user_id = ?) OR (scope_type = ? AND scope_value LIKE ?)", ownerWecomUserID, "manager", "%"+ownerWecomUserID+"%")
	}
	if ownerName := strings.TrimSpace(ctx.Query("ownerName")); ownerName != "" {
		queryDB = queryDB.Where("(owner_name = ?) OR (scope_type = ? AND scope_value LIKE ?)", ownerName, "manager", "%"+ownerName+"%")
	}
	queryDB = queryDB.Order("created_at desc")
	if !all {
		queryDB = queryDB.Offset((page - 1) * pageSize).Limit(pageSize)
	}
	if err := queryDB.Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	if all {
		pageSize = len(items)
		if pageSize == 0 {
			pageSize = 1
		}
	}
	success(ctx, buildPaginatedPayload(items, total, page, pageSize))
}

func (app *App) getBatchExecutionRun(ctx *gin.Context) {
	id, err := parseID(ctx, "id")
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid id")
		return
	}
	var item BatchExecutionRun
	if err := app.db.Preload("Plan").First(&item, id).Error; err != nil {
		fail(ctx, http.StatusNotFound, "batch execution run not found")
		return
	}
	var jobs []InspectionJob
	if err := app.db.
		Preload("Store").
		Preload("Plan").
		Preload("Binding").
		Preload("Binding.Stream").
		Preload("Result").
		Where("batch_id = ?", item.ID).
		Order("id asc").
		Find(&jobs).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	item.Jobs = jobs
	success(ctx, item)
}

func (app *App) retryFailedBatchExecutionRun(ctx *gin.Context) {
	id, err := parseID(ctx, "id")
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid id")
		return
	}
	retryCount := int64(0)
	err = app.db.Transaction(func(tx *gorm.DB) error {
		var item BatchExecutionRun
		if err := tx.First(&item, id).Error; err != nil {
			return err
		}
		result := tx.Model(&InspectionJob{}).
			Where("batch_id = ? AND status = ?", id, "error").
			Updates(map[string]interface{}{
				"status":        "pending",
				"started_at":    nil,
				"finished_at":   nil,
				"error_message": "",
			})
		if result.Error != nil {
			return result.Error
		}
		retryCount = result.RowsAffected
		if retryCount == 0 {
			return errors.New("当前批次没有可重试的失败任务")
		}
		return tx.Model(&BatchExecutionRun{ID: id}).Updates(map[string]interface{}{
			"status":      "running",
			"finished_at": nil,
		}).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			fail(ctx, http.StatusNotFound, "batch execution run not found")
			return
		}
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	if refreshErr := app.refreshBatchExecutionRun(id); refreshErr != nil {
		fail(ctx, http.StatusInternalServerError, refreshErr.Error())
		return
	}
	var item BatchExecutionRun
	if err := app.db.Preload("Plan").First(&item, id).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, gin.H{
		"retryCount": retryCount,
		"batch":      item,
	})
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

func (app *App) listMatchLogs(ctx *gin.Context) {
	page, pageSize, all := parsePagination(ctx, 10, 500)
	if rawLimit := strings.TrimSpace(ctx.Query("limit")); rawLimit != "" {
		if parsed, err := strconv.Atoi(rawLimit); err == nil && parsed > 0 && parsed <= 500 {
			pageSize = parsed
			page = 1
		}
	}
	var items []InspectionMatchLog
	db := app.db.Model(&InspectionMatchLog{})
	if jobIDText := strings.TrimSpace(ctx.Query("jobId")); jobIDText != "" {
		if jobID, err := strconv.ParseUint(jobIDText, 10, 64); err == nil && jobID > 0 {
			db = db.Where("job_id = ?", jobID)
		}
	}
	query := strings.TrimSpace(ctx.Query("query"))
	if query != "" {
		pattern := "%" + query + "%"
		db = db.Where(
			"query_text LIKE ? OR requested_store_name LIKE ? OR requested_plan_name LIKE ? OR requested_stream_name LIKE ? OR matched_store_name LIKE ? OR matched_plan_name LIKE ? OR matched_stream_name LIKE ?",
			pattern,
			pattern,
			pattern,
			pattern,
			pattern,
			pattern,
			pattern,
		)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	queryDB := db.Order("created_at desc")
	if !all {
		queryDB = queryDB.Offset((page - 1) * pageSize).Limit(pageSize)
	}
	if err := queryDB.Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	if all {
		pageSize = len(items)
		if pageSize == 0 {
			pageSize = 1
		}
	}
	success(ctx, buildPaginatedPayload(items, total, page, pageSize))
}

func (app *App) listSchedules(ctx *gin.Context) {
	var items []Schedule
	page, pageSize, all := parsePagination(ctx, 10, 200)
	db := app.db.Model(&Schedule{})
	var total int64
	if err := db.Count(&total).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	queryDB := db.Order("updated_at desc")
	if !all {
		queryDB = queryDB.Offset((page - 1) * pageSize).Limit(pageSize)
	}
	if err := queryDB.Find(&items).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	if all {
		pageSize = len(items)
		if pageSize == 0 {
			pageSize = 1
		}
	}
	success(ctx, buildPaginatedPayload(items, total, page, pageSize))
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

func (app *App) estimateBatchExecution(ctx *gin.Context) {
	var req batchExecutionRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	plan, stores, targets, err := app.buildBatchExecutionTargets(req)
	if err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	success(ctx, app.buildBatchEstimatePayload(req, plan, stores, targets))
}

func (app *App) createBatchExecution(ctx *gin.Context) {
	var req batchExecutionRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	plan, stores, targets, err := app.buildBatchExecutionTargets(req)
	if err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	if len(targets) == 0 {
		fail(ctx, http.StatusBadRequest, "当前条件下没有可执行的批量巡检任务")
		return
	}

	now := time.Now()
	ownerName, ownerWecomUserID, ownerSource := resolveBatchOwner(req)
	triggerSource := normalizeBatchTriggerSource(req)
	batchRun := BatchExecutionRun{
		BatchNo:             fmt.Sprintf("BATCHRUN-%s", now.Format("20060102150405")),
		ScopeType:           detectBatchScopeType(req),
		ScopeValue:          detectBatchScopeValue(req),
		OperatorName:        valueOr(req.OperatorName, "批量巡检"),
		OperatorWecomUserID: valueOr(req.OperatorWecomUserID, "inspection-admin"),
		OwnerName:           ownerName,
		OwnerWecomUserID:    ownerWecomUserID,
		OwnerSource:         ownerSource,
		TriggerSource:       triggerSource,
		PlanID:              plan.ID,
		PlanName:            plan.Name,
		ExecutionMode:       normalizeExecutionMode(req.ExecutionMode),
		SampleSize:          normalizedSampleSize(req.SampleSize),
		SelectedStoreCount:  len(stores),
		MatchedStoreCount:   countUniqueTargetStores(targets),
		TotalJobs:           len(targets),
		PendingJobs:         len(targets),
		Status:              "pending",
		SummaryText:         buildBatchSummaryText(plan.Name, len(stores), countUniqueTargetStores(targets), len(targets), 0, 0, 0),
	}
	createdJobs := make([]InspectionJob, 0, len(targets))
	err = app.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&batchRun).Error; err != nil {
			return err
		}
		for index, target := range targets {
			job := InspectionJob{
				JobNo:               fmt.Sprintf("BATCH-%s-%03d", now.Format("20060102150405"), index+1),
				BatchID:             &batchRun.ID,
				StoreID:             target.Store.ID,
				PlanID:              target.Plan.ID,
				BindingID:           target.Binding.ID,
				TriggerType:         "manual",
				TriggerSource:       triggerSource,
				OperatorName:        valueOr(req.OperatorName, "批量巡检"),
				OperatorWecomUserID: valueOr(req.OperatorWecomUserID, "inspection-admin"),
				Status:              "pending",
			}
			if err := tx.Create(&job).Error; err != nil {
				return err
			}
			createdJobs = append(createdJobs, job)
			trace := resolveTrace{
				QueryText:       fmt.Sprintf("%s | %s", target.Store.Name, target.Plan.Name),
				ConfigVersion:   app.currentConfigVersion(),
				StoreMatch:      matchCandidate{Mode: "store_id", Score: 1300, Candidate: strconv.FormatUint(uint64(target.Store.ID), 10), Explanation: fmt.Sprintf("批量任务选中门店「%s」", target.Store.Name)},
				PlanMatch:       matchCandidate{Mode: "plan_id", Score: 1300, Candidate: strconv.FormatUint(uint64(target.Plan.ID), 10), Explanation: fmt.Sprintf("批量任务选中计划「%s」", target.Plan.Name)},
				StreamMatch:     matchCandidate{Mode: "binding_stream", Score: 1000, Candidate: target.Binding.Stream.Name, Explanation: fmt.Sprintf("批量任务使用监控模块「%s」", target.Binding.Stream.Name)},
				BindingMatch:    matchCandidate{Mode: "binding_priority", Score: 1000, Candidate: target.Binding.Stream.Name, Explanation: fmt.Sprintf("按绑定优先级选择监控模块「%s」", target.Binding.Stream.Name)},
				DecisionSummary: fmt.Sprintf("批量巡检已创建：%s / %s / %s", target.Store.Name, target.Plan.Name, target.Binding.Stream.Name),
			}
			contextReq := executeContextRequest{
				StoreID: target.Store.ID,
				PlanID:  target.Plan.ID,
			}
			app.writeMatchLog(contextReq, trace, &target.Store, &target.Plan, &target.Binding.Stream, &target.Binding, &job.ID)
		}
		return nil
	})
	if err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	if err := app.refreshBatchExecutionRun(batchRun.ID); err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	if err := app.db.Preload("Plan").First(&batchRun, batchRun.ID).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}

	if len(createdJobs) > 0 {
		jobIDs := make([]uint, 0, len(createdJobs))
		for _, item := range createdJobs {
			jobIDs = append(jobIDs, item.ID)
		}
		var loadedJobs []InspectionJob
		if err := app.db.
			Preload("Store").
			Preload("Plan").
			Preload("Binding").
			Preload("Binding.Store").
			Preload("Binding.Plan").
			Preload("Binding.Stream").
			Where("id IN ?", jobIDs).
			Order("id asc").
			Find(&loadedJobs).Error; err == nil {
			createdJobs = loadedJobs
		}
	}

	success(ctx, gin.H{
		"batch":   batchRun,
		"summary": app.buildBatchEstimatePayload(req, plan, stores, targets),
		"jobs":    createdJobs,
	})
}

func (app *App) executeContext(ctx *gin.Context) {
	var req executeContextRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	store, plan, binding, stream, items, alertRule, trace, err := app.resolveExecutionContext(req)
	if err != nil {
		app.writeMatchLog(req, trace, nil, nil, nil, nil, nil)
		fail(ctx, http.StatusNotFound, err.Error())
		return
	}
	app.writeMatchLog(req, trace, &store, &plan, &stream, &binding, nil)
	success(ctx, gin.H{
		"store":     store,
		"stream":    stream,
		"plan":      plan,
		"items":     items,
		"binding":   binding,
		"alertRule": alertRule,
		"trace":     trace,
	})
}

func (app *App) createManualExecution(ctx *gin.Context) {
	var req manualExecutionRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	contextReq := executeContextRequest{
		StoreID:    req.StoreID,
		StoreName:  req.StoreName,
		PlanID:     req.PlanID,
		PlanName:   req.PlanName,
		StreamName: req.StreamName,
		Source:     req.Source,
		RawQuery:   req.RawQuery,
	}
	store, plan, binding, stream, items, alertRule, trace, err := app.resolveExecutionContext(contextReq)
	if err != nil {
		app.writeMatchLog(contextReq, trace, nil, nil, nil, nil, nil)
		fail(ctx, http.StatusNotFound, err.Error())
		return
	}
	now := time.Now()
	initialStatus := "pending"
	var startedAt *time.Time
	if strings.TrimSpace(req.TriggerSource) == "stream_frame_watch_analyze" {
		initialStatus = "running"
		startedAt = &now
	}
	job := InspectionJob{
		JobNo:              fmt.Sprintf("JOB-%s-%04d", now.Format("20060102150405"), time.Now().Nanosecond()%10000),
		StoreID:            store.ID,
		PlanID:             plan.ID,
		BindingID:          binding.ID,
		TriggerType:        valueOr(req.TriggerType, "manual"),
		TriggerSource:      req.TriggerSource,
		OperatorName:       req.OperatorName,
		OperatorWecomUserID: req.OperatorWecomUserID,
		Status:             initialStatus,
		StartedAt:          startedAt,
	}
	if err := app.db.Create(&job).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	app.writeMatchLog(contextReq, trace, &store, &plan, &stream, &binding, &job.ID)
	success(ctx, gin.H{
		"job":       job,
		"store":     store,
		"stream":    stream,
		"plan":      plan,
		"items":     items,
		"alertRule": alertRule,
		"trace":     trace,
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
	app.refreshBatchForJob(job)
	success(ctx, result)
}

type batchExecutionTarget struct {
	Store   Store
	Plan    InspectionPlan
	Binding StorePlanBinding
	Items   []InspectionPlanItem
}

func (app *App) buildBatchExecutionTargets(req batchExecutionRequest) (InspectionPlan, []Store, []batchExecutionTarget, error) {
	var plan InspectionPlan
	var planMatch matchCandidate
	var err error
	switch {
	case req.PlanID > 0:
		if err = app.db.First(&plan, req.PlanID).Error; err != nil {
			return InspectionPlan{}, nil, nil, errors.New("批量巡检计划不存在")
		}
	case strings.TrimSpace(req.PlanName) != "":
		plan, planMatch, err = app.findPlanByNameLike(strings.TrimSpace(req.PlanName))
		_ = planMatch
		if err != nil {
			return InspectionPlan{}, nil, nil, err
		}
	default:
		return InspectionPlan{}, nil, nil, errors.New("请先选择巡检计划")
	}

	stores, err := app.listBatchStores(req)
	if err != nil {
		return InspectionPlan{}, nil, nil, err
	}
	if len(stores) == 0 {
		return InspectionPlan{}, nil, nil, errors.New("当前条件下没有可巡检门店")
	}

	var items []InspectionPlanItem
	if err := app.db.Where("plan_id = ? AND enabled = ?", plan.ID, true).Order("sort_order asc, id asc").Find(&items).Error; err != nil {
		return InspectionPlan{}, nil, nil, err
	}

	storeBindings := make(map[uint][]StorePlanBinding, len(stores))
	eligibleStores := make([]Store, 0, len(stores))
	for _, store := range stores {
		bindings, err := app.listBindingsForStorePlan(store.ID, plan.ID)
		if err != nil {
			return InspectionPlan{}, nil, nil, err
		}
		if len(bindings) == 0 {
			continue
		}
		storeBindings[store.ID] = bindings
		eligibleStores = append(eligibleStores, store)
	}

	selectedStores := eligibleStores
	if normalizeExecutionMode(req.ExecutionMode) == "sample" {
		selectedStores = sampleStores(eligibleStores, req.SampleSize)
	}

	targets := make([]batchExecutionTarget, 0, len(selectedStores))
	for _, store := range selectedStores {
		for _, binding := range storeBindings[store.ID] {
			targets = append(targets, batchExecutionTarget{
				Store:   store,
				Plan:    plan,
				Binding: binding,
				Items:   items,
			})
		}
	}

	return plan, selectedStores, targets, nil
}

func (app *App) buildBatchEstimatePayload(req batchExecutionRequest, plan InspectionPlan, stores []Store, targets []batchExecutionTarget) gin.H {
	ownerName, ownerWecomUserID, ownerSource := resolveBatchOwner(req)
	storeIDs := make(map[uint]struct{}, len(targets))
	monitorIDs := make(map[uint]struct{}, len(targets))
	totalItems := 0
	for _, target := range targets {
		storeIDs[target.Store.ID] = struct{}{}
		monitorIDs[target.Binding.StreamID] = struct{}{}
		totalItems += len(target.Items)
	}
	storeCount := len(storeIDs)
	monitorCount := len(monitorIDs)
	skippedStores := make([]Store, 0)
	for _, store := range stores {
		if _, ok := storeIDs[store.ID]; !ok {
			skippedStores = append(skippedStores, store)
		}
	}
	skippedStoreCount := len(skippedStores)
	estimatedSeconds := estimateBatchDurationSeconds(storeCount, len(targets), totalItems)
	summaryText := fmt.Sprintf(
		"本次预计巡检 %d 家门店、%d 个监控点、%d 条点检项，预计 %s。",
		storeCount,
		monitorCount,
		totalItems,
		formatEstimatedDurationLabel(estimatedSeconds),
	)
	if skippedStoreCount > 0 {
		summaryText = fmt.Sprintf(
			"本次共选择 %d 家门店，实际命中 %d 家门店、%d 个监控点、%d 条点检项，预计 %s；另有 %d 家门店因未绑定该计划被自动跳过。",
			len(stores),
			storeCount,
			monitorCount,
			totalItems,
			formatEstimatedDurationLabel(estimatedSeconds),
			skippedStoreCount,
		)
	}
	return gin.H{
		"planId":             plan.ID,
		"planName":           plan.Name,
		"ownerName":          ownerName,
		"ownerWecomUserId":   ownerWecomUserID,
		"ownerSource":        ownerSource,
		"triggerSource":      normalizeBatchTriggerSource(req),
		"executionMode":      normalizeExecutionMode(req.ExecutionMode),
		"sampleSize":         normalizedSampleSize(req.SampleSize),
		"storeCount":         storeCount,
		"selectedStoreCount": len(stores),
		"skippedStoreCount":  skippedStoreCount,
		"jobCount":           len(targets),
		"monitorCount":       monitorCount,
		"planItemCount":      totalItems,
		"estimatedSeconds":   estimatedSeconds,
		"estimatedLabel":     formatEstimatedDurationLabel(estimatedSeconds),
		"summaryText":        summaryText,
		"stores":             stores,
		"skippedStores":      skippedStores,
	}
}

func (app *App) resolveExecutionContext(req executeContextRequest) (Store, InspectionPlan, StorePlanBinding, StoreStream, []InspectionPlanItem, AlertRule, resolveTrace, error) {
	req = app.normalizeExecutionRequest(req)
	var store Store
	var plan InspectionPlan
	var stream StoreStream
	trace := resolveTrace{
		QueryText:     composeMatchQuery(req),
		ConfigVersion: app.currentConfigVersion(),
	}
	planQuery := strings.TrimSpace(req.PlanName)
	sourceQuery := strings.TrimSpace(req.Source)
	streamQuery := strings.TrimSpace(req.StreamName)
	if streamQuery == "" {
		streamQuery = sourceQuery
	}

	if req.StoreID > 0 {
		if err := app.db.First(&store, req.StoreID).Error; err != nil {
			trace.ErrorMessage = "门店不存在"
			return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, trace, errors.New("门店不存在")
		}
		trace.StoreMatch = matchCandidate{
			Mode:        "store_id",
			Score:       1300,
			Candidate:   strconv.FormatUint(uint64(req.StoreID), 10),
			Explanation: fmt.Sprintf("通过 storeId=%d 命中门店「%s」", req.StoreID, store.Name),
		}
	} else if strings.TrimSpace(req.StoreName) != "" {
		resolvedStore, match, err := app.findStoreByNameLike(strings.TrimSpace(req.StoreName))
		if err != nil {
			trace.ErrorMessage = err.Error()
			return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, trace, err
		}
		store = resolvedStore
		trace.StoreMatch = match
	} else if strings.TrimSpace(req.Source) != "" {
		resolvedStream, match, err := app.findStreamBySourceQuery(sourceQuery, 0)
		if err != nil {
			trace.ErrorMessage = "未找到对应流媒体"
			return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, trace, errors.New("未找到对应流媒体")
		}
		stream = resolvedStream
		trace.StreamMatch = match
		store = stream.Store
		trace.StoreMatch = matchCandidate{
			Mode:        "store_from_stream",
			Score:       match.Score,
			Candidate:   stream.Name,
			Explanation: fmt.Sprintf("通过监控模块「%s」反查门店「%s」", stream.Name, store.Name),
		}
	}

	if req.PlanID > 0 {
		if err := app.db.First(&plan, req.PlanID).Error; err != nil {
			trace.ErrorMessage = "巡检计划不存在"
			return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, trace, errors.New("巡检计划不存在")
		}
		trace.PlanMatch = matchCandidate{
			Mode:        "plan_id",
			Score:       1300,
			Candidate:   strconv.FormatUint(uint64(req.PlanID), 10),
			Explanation: fmt.Sprintf("通过 planId=%d 命中计划「%s」", req.PlanID, plan.Name),
		}
	} else if planQuery != "" {
		if store.ID > 0 {
			resolvedPlan, match, err := app.findPlanForStore(store, planQuery, strings.TrimSpace(req.StoreName))
			if err != nil {
				trace.ErrorMessage = err.Error()
				return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, trace, err
			}
			plan = resolvedPlan
			trace.PlanMatch = match
		} else {
			resolvedPlan, match, err := app.findPlanByNameLike(planQuery)
			if err != nil {
				trace.ErrorMessage = err.Error()
				return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, trace, err
			}
			plan = resolvedPlan
			trace.PlanMatch = match
		}
	} else {
		if store.ID > 0 {
			defaultBinding, err := app.findDefaultBindingForStore(store.ID)
			if err != nil {
				trace.ErrorMessage = "没有可用巡检计划"
				return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, trace, errors.New("没有可用巡检计划")
			}
			plan = defaultBinding.Plan
			trace.PlanMatch = matchCandidate{
				Mode:        "plan_default_binding_priority",
				Score:       300 + defaultBinding.Priority,
				Candidate:   plan.Name,
				Explanation: fmt.Sprintf("未显式传计划，按门店绑定优先级默认使用「%s」", plan.Name),
			}
		} else if err := app.db.Where("enabled = ?", true).Order("id asc").First(&plan).Error; err != nil {
			trace.ErrorMessage = "没有可用巡检计划"
			return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, trace, errors.New("没有可用巡检计划")
		} else {
			trace.PlanMatch = matchCandidate{
				Mode:        "plan_default",
				Score:       100,
				Candidate:   plan.Name,
				Explanation: fmt.Sprintf("未显式传计划，默认使用「%s」", plan.Name),
			}
		}
	}

	binding, bindingMatch, err := app.findBindingForExecution(store, plan, streamQuery)
	if err != nil {
		trace.BindingMatch = bindingMatch
		trace.ErrorMessage = err.Error()
		return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, trace, err
	}
	trace.BindingMatch = bindingMatch
	if stream.ID == 0 {
		stream = binding.Stream
	}
	if trace.StreamMatch.Mode == "" {
		trace.StreamMatch = matchCandidate{
			Mode:        "binding_stream",
			Score:       bindingMatch.Score,
			Candidate:   binding.Stream.Name,
			Explanation: fmt.Sprintf("执行监控模块使用绑定结果「%s」", binding.Stream.Name),
		}
	}

	var items []InspectionPlanItem
	if err := app.db.Where("plan_id = ? AND enabled = ?", plan.ID, true).Order("sort_order asc, id asc").Find(&items).Error; err != nil {
		trace.ErrorMessage = err.Error()
		return Store{}, InspectionPlan{}, StorePlanBinding{}, StoreStream{}, nil, AlertRule{}, trace, err
	}

	var alertRule AlertRule
	_ = app.db.Where("store_id = ? AND plan_id = ? AND enabled = ?", binding.StoreID, binding.PlanID, true).First(&alertRule).Error

	if binding.CustomMatchThresholdPercent > 0 {
		plan.MatchThresholdPercent = binding.CustomMatchThresholdPercent
	}
	if binding.CustomDifferenceThresholdPercent > 0 {
		plan.DifferenceThresholdPercent = binding.CustomDifferenceThresholdPercent
	}

	trace.DecisionSummary = fmt.Sprintf(
		"门店命中=%s；计划命中=%s；监控命中=%s；最终执行=%s / %s / %s",
		valueOr(trace.StoreMatch.Explanation, "未记录"),
		valueOr(trace.PlanMatch.Explanation, "未记录"),
		valueOr(trace.StreamMatch.Explanation, "未记录"),
		binding.Store.Name,
		binding.Plan.Name,
		binding.Stream.Name,
	)

	return binding.Store, plan, binding, binding.Stream, items, alertRule, trace, nil
}

func (app *App) normalizeExecutionRequest(req executeContextRequest) executeContextRequest {
	storeName := strings.TrimSpace(req.StoreName)
	planName := strings.TrimSpace(req.PlanName)
	rawQuery := strings.TrimSpace(req.RawQuery)

	combined := ""
	switch {
	case storeName != "" && planName != "" && normalizeLookupToken(storeName) == normalizeLookupToken(planName):
		combined = storeName
	case storeName == "" && planName != "" && strings.Contains(planName, " "):
		combined = planName
	case planName == "" && storeName != "" && strings.Contains(storeName, " "):
		combined = storeName
	case storeName == "" && planName == "" && strings.Contains(rawQuery, " "):
		combined = rawQuery
	}

	combined = strings.TrimSpace(combined)
	if combined == "" {
		return req
	}

	tokens := strings.Fields(combined)
	if len(tokens) < 2 {
		return req
	}

	for i := 1; i < len(tokens); i++ {
		candidateStore := strings.TrimSpace(strings.Join(tokens[:i], " "))
		candidatePlan := strings.TrimSpace(strings.Join(tokens[i:], " "))
		if candidateStore == "" || candidatePlan == "" {
			continue
		}
		store, _, err := app.findStoreByNameLike(candidateStore)
		if err != nil {
			continue
		}
		if _, _, err := app.findPlanForStore(store, candidatePlan, candidateStore); err != nil {
			continue
		}
		req.StoreName = candidateStore
		req.PlanName = candidatePlan
		if rawQuery == "" {
			req.RawQuery = combined
		}
		return req
	}

	return req
}

func valueOr(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func resolveBatchOwner(req batchExecutionRequest) (string, string, string) {
	ownerName := strings.TrimSpace(req.OwnerName)
	ownerWecomUserID := strings.TrimSpace(req.OwnerWecomUserID)
	ownerSource := strings.TrimSpace(req.OwnerSource)
	if ownerName == "" {
		ownerName = strings.TrimSpace(req.ManagerName)
	}
	if ownerWecomUserID == "" {
		ownerWecomUserID = strings.TrimSpace(req.ManagerWecomUserID)
	}
	if ownerSource == "" && (ownerName != "" || ownerWecomUserID != "") {
		if strings.TrimSpace(req.OwnerName) != "" || strings.TrimSpace(req.OwnerWecomUserID) != "" {
			ownerSource = "wecom_owner"
		} else {
			ownerSource = "manager_scope"
		}
	}
	return ownerName, ownerWecomUserID, ownerSource
}

func resolveBatchManagerScope(req batchExecutionRequest) (string, string) {
	managerName := strings.TrimSpace(req.ManagerName)
	managerWecomUserID := strings.TrimSpace(req.ManagerWecomUserID)
	if managerName != "" || managerWecomUserID != "" {
		return managerName, managerWecomUserID
	}
	ownerName, ownerWecomUserID, _ := resolveBatchOwner(req)
	return ownerName, ownerWecomUserID
}

func normalizeBatchTriggerSource(req batchExecutionRequest) string {
	if triggerSource := strings.TrimSpace(req.TriggerSource); triggerSource != "" {
		return triggerSource
	}
	ownerName, ownerWecomUserID, ownerSource := resolveBatchOwner(req)
	if ownerName != "" || ownerWecomUserID != "" || ownerSource != "" {
		return "wecom_owner_batch"
	}
	return "inspection_admin_batch"
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

func composeMatchQuery(req executeContextRequest) string {
	if strings.TrimSpace(req.RawQuery) != "" {
		return strings.TrimSpace(req.RawQuery)
	}
	parts := []string{
		strings.TrimSpace(req.StoreName),
		strings.TrimSpace(req.PlanName),
		strings.TrimSpace(req.StreamName),
		strings.TrimSpace(req.Source),
	}
	return strings.Join(dedupeLookupValues(parts), " | ")
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

func streamLookupCandidates(stream StoreStream) []string {
	values := []string{stream.Name, stream.StreamURL, stream.SourceAlias}
	values = append(values, splitLookupValues(stream.AliasList)...)
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

func formatCandidateOptions(values []string) string {
	items := dedupeLookupValues(values)
	if len(items) == 0 {
		return ""
	}
	if len(items) > 3 {
		items = items[:3]
	}
	parts := make([]string, 0, len(items))
	for index, item := range items {
		parts = append(parts, fmt.Sprintf("%d. %s", index+1, item))
	}
	return strings.Join(parts, " ")
}

func appendRankedOption(options []rankedOption, label string, score int, limit int) []rankedOption {
	if strings.TrimSpace(label) == "" || score <= 0 {
		return options
	}
	for _, item := range options {
		if normalizeLookupToken(item.Label) == normalizeLookupToken(label) {
			return options
		}
	}
	insertAt := len(options)
	for index, item := range options {
		if score > item.Score {
			insertAt = index
			break
		}
	}
	options = append(options, rankedOption{})
	copy(options[insertAt+1:], options[insertAt:])
	options[insertAt] = rankedOption{Label: label, Score: score}
	if limit > 0 && len(options) > limit {
		options = options[:limit]
	}
	return options
}

func rankedOptionLabels(options []rankedOption) []string {
	labels := make([]string, 0, len(options))
	for _, item := range options {
		if strings.TrimSpace(item.Label) == "" {
			continue
		}
		labels = append(labels, item.Label)
	}
	return dedupeLookupValues(labels)
}

func bestConfidence(values ...int) int {
	best := 0
	for _, value := range values {
		if value > best {
			best = value
		}
	}
	return best
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}

func minInt(left int, right int) int {
	if left < right {
		return left
	}
	return right
}

func modeForScore(score int) string {
	switch {
	case score >= 1000:
		return "exact"
	case score >= 800:
		return "contains"
	case score >= 500:
		return "reverse_contains"
	case score >= 260:
		return "fuzzy"
	default:
		return ""
	}
}

func bestLookupMatch(query string, candidates []string) matchCandidate {
	best := matchCandidate{}
	for _, candidate := range candidates {
		score := scoreLookupCandidate(query, candidate)
		if score > best.Score {
			best = matchCandidate{
				Mode:        modeForScore(score),
				Score:       score,
				Candidate:   candidate,
				Explanation: fmt.Sprintf("命中候选词：%s", candidate),
			}
		}
	}
	if best.Mode == "" && strings.TrimSpace(query) == "" {
		best.Mode = "not_provided"
		best.Explanation = "未提供该维度的命中条件"
	}
	return best
}

func (app *App) findStreamForStoreByQuery(storeID uint, query string) (StoreStream, matchCandidate, error) {
	text := strings.TrimSpace(query)
	if text == "" {
		return StoreStream{}, matchCandidate{Mode: "not_provided", Explanation: "未指定监控模块"}, errors.New("监控模块名称不能为空")
	}

	var streams []StoreStream
	if err := app.db.Where("store_id = ? AND enabled = ?", storeID, true).Find(&streams).Error; err != nil {
		return StoreStream{}, matchCandidate{}, err
	}
	bestScore := 0
	var best StoreStream
	var bestMatch matchCandidate
	for _, stream := range streams {
		match := bestLookupMatch(text, streamLookupCandidates(stream))
		if match.Score > bestScore {
			bestScore = match.Score
			best = stream
			bestMatch = match
		}
	}
	if best.ID > 0 && bestScore >= 260 {
		return best, bestMatch, nil
	}
	streamNames := make([]string, 0, len(streams))
	for _, stream := range streams {
		streamNames = append(streamNames, stream.Name)
	}
	return StoreStream{}, bestMatch, fmt.Errorf("未命中监控模块「%s」，当前可用模块: %s", text, formatNameList(streamNames))
}

func (app *App) findBestBinding(store Store, plan InspectionPlan, sourceQuery string, streamNameQuery string) (StorePlanBinding, matchCandidate, matchCandidate, error) {
	var bindings []StorePlanBinding
	if err := app.db.Preload("Store").Preload("Plan").Preload("Stream").
		Where("store_id = ? AND plan_id = ? AND enabled = ?", store.ID, plan.ID, true).
		Order("priority desc, updated_at desc, id asc").
		Find(&bindings).Error; err != nil {
		return StorePlanBinding{}, matchCandidate{}, matchCandidate{}, err
	}
	if len(bindings) == 0 {
		return StorePlanBinding{}, matchCandidate{}, matchCandidate{}, errors.New("门店未绑定对应巡检计划")
	}

	sourceText := strings.TrimSpace(sourceQuery)
	streamText := strings.TrimSpace(streamNameQuery)
	if sourceText == "" && streamText == "" {
		selected := bindings[0]
		return selected,
			matchCandidate{Mode: "priority_default", Score: 300 + maxInt(selected.Priority, 0), Candidate: selected.Stream.Name, Explanation: "未指定监控模块，按绑定优先级命中"},
			matchCandidate{Mode: "priority_default", Score: 300 + maxInt(selected.Priority, 0), Candidate: strconv.Itoa(selected.Priority), Explanation: fmt.Sprintf("采用绑定优先级 %d", selected.Priority)},
			nil
	}

	bestScore := -1
	var best StorePlanBinding
	var bestStreamMatch matchCandidate
	var bestBindingMatch matchCandidate
	for _, binding := range bindings {
		streamMatch := matchCandidate{}
		if sourceText != "" {
			streamMatch = bestLookupMatch(sourceText, streamLookupCandidates(binding.Stream))
		}
		if streamText != "" {
			nameMatch := bestLookupMatch(streamText, streamLookupCandidates(binding.Stream))
			if nameMatch.Score > streamMatch.Score {
				streamMatch = nameMatch
			}
		}
		score := streamMatch.Score
		if score > 0 {
			score += maxInt(binding.Priority, 0)
		}
		if score > bestScore {
			bestScore = score
			best = binding
			bestStreamMatch = streamMatch
			bestBindingMatch = matchCandidate{
				Mode:        "priority_ranked",
				Score:       300 + maxInt(binding.Priority, 0),
				Candidate:   strconv.Itoa(binding.Priority),
				Explanation: fmt.Sprintf("绑定优先级 %d", binding.Priority),
			}
		}
	}

	if best.ID > 0 && bestStreamMatch.Score >= 260 {
		return best, bestStreamMatch, bestBindingMatch, nil
	}

	streamNames := make([]string, 0, len(bindings))
	for _, binding := range bindings {
		streamNames = append(streamNames, binding.Stream.Name)
	}
	queryText := streamText
	if queryText == "" {
		queryText = sourceText
	}
	return StorePlanBinding{}, bestStreamMatch, bestBindingMatch, fmt.Errorf("门店「%s」计划「%s」未命中监控模块「%s」，当前可用模块: %s", store.Name, plan.Name, queryText, formatNameList(streamNames))
}

func (app *App) findStoreByNameLike(name string) (Store, matchCandidate, error) {
	query := strings.TrimSpace(name)
	if query == "" {
		return Store{}, matchCandidate{}, errors.New("门店名称不能为空")
	}
	var exact Store
	if err := app.db.Where("name = ? OR code = ?", query, query).First(&exact).Error; err == nil {
		return exact, matchCandidate{
			Mode:        "store_exact",
			Score:       1200,
			Candidate:   query,
			Explanation: fmt.Sprintf("门店按名称/编码精确命中「%s」", exact.Name),
		}, nil
	}

	var stores []Store
	if err := app.db.Find(&stores).Error; err != nil {
		return Store{}, matchCandidate{}, err
	}
	bestScore := 0
	var best Store
	bestValue := ""
	suggestions := make([]rankedOption, 0, 3)
	queryCandidates := expandAliasCandidates(query, storeAliasMap)
	for _, store := range stores {
		storeBestScore := 0
		candidates := storeLookupCandidates(store)
		for _, queryCandidate := range queryCandidates {
			for _, candidate := range candidates {
				score := scoreLookupCandidate(queryCandidate, candidate)
				if score > storeBestScore {
					storeBestScore = score
				}
				if score > bestScore {
					bestScore = score
					best = store
					bestValue = candidate
				}
			}
		}
		if storeBestScore >= 260 {
			suggestions = appendRankedOption(suggestions, store.Name, storeBestScore, 3)
		}
	}
	if best.ID > 0 && bestScore >= 500 {
		mode := "store_fuzzy"
		if normalizeLookupToken(bestValue) == normalizeLookupToken(best.Name) {
			mode = "store_name_match"
		} else if slices := splitLookupValues(best.AliasList); len(slices) > 0 {
			for _, alias := range slices {
				if normalizeLookupToken(alias) == normalizeLookupToken(bestValue) {
					mode = "store_alias_match"
					break
				}
			}
		}
		return best, matchCandidate{
			Mode:        mode,
			Score:       bestScore,
			Candidate:   bestValue,
			Explanation: fmt.Sprintf("门店通过「%s」命中「%s」", bestValue, best.Name),
		}, nil
	}
	storeNames := make([]string, 0, len(stores))
	for _, store := range stores {
		storeNames = append(storeNames, store.Name)
	}
	candidateText := formatCandidateOptions(rankedOptionLabels(suggestions))
	if candidateText != "" {
		return Store{}, matchCandidate{}, fmt.Errorf("未完全命中门店「%s」。请确认是否想执行：%s", query, candidateText)
	}
	return Store{}, matchCandidate{}, fmt.Errorf("未命中门店「%s」，当前可用门店: %s", query, formatNameList(storeNames))
}

func (app *App) findPlanByNameExact(name string) (InspectionPlan, matchCandidate, error) {
	query := strings.TrimSpace(name)
	if query == "" {
		return InspectionPlan{}, matchCandidate{}, errors.New("巡检计划名称不能为空")
	}

	var exact InspectionPlan
	if err := app.db.Where("enabled = ? AND (name = ? OR code = ?)", true, query, query).First(&exact).Error; err == nil {
		return exact, matchCandidate{
			Mode:        "plan_exact",
			Score:       1200,
			Candidate:   query,
			Explanation: fmt.Sprintf("计划按名称/编码精确命中「%s」", exact.Name),
		}, nil
	}

	var plans []InspectionPlan
	if err := app.db.Where("enabled = ?", true).Find(&plans).Error; err != nil {
		return InspectionPlan{}, matchCandidate{}, err
	}

	normalizedQuery := normalizeLookupToken(query)
	for _, candidate := range plans {
		for _, lookup := range planLookupCandidates(candidate) {
			if normalizeLookupToken(lookup) == normalizedQuery && normalizedQuery != "" {
				mode := "plan_alias_match"
				if normalizeLookupToken(lookup) == normalizeLookupToken(candidate.Name) {
					mode = "plan_name_match"
				}
				return candidate, matchCandidate{
					Mode:        mode,
					Score:       1000,
					Candidate:   lookup,
					Explanation: fmt.Sprintf("计划通过「%s」精确命中「%s」", lookup, candidate.Name),
				}, nil
			}
		}
	}

	return InspectionPlan{}, matchCandidate{}, gorm.ErrRecordNotFound
}

func (app *App) findPlanByNameLike(name string) (InspectionPlan, matchCandidate, error) {
	query := strings.TrimSpace(name)
	if query == "" {
		return InspectionPlan{}, matchCandidate{}, errors.New("巡检计划名称不能为空")
	}

	if exact, trace, err := app.findPlanByNameExact(query); err == nil {
		return exact, trace, nil
	}

	var plans []InspectionPlan
	if err := app.db.Where("enabled = ?", true).Find(&plans).Error; err != nil {
		return InspectionPlan{}, matchCandidate{}, err
	}
	bestScore := 0
	var best InspectionPlan
	bestValue := ""
	suggestions := make([]rankedOption, 0, 3)
	for _, candidate := range plans {
		score := 0
		candidateValue := ""
		for _, lookup := range planLookupCandidates(candidate) {
			candidateScore := scoreLookupCandidate(query, lookup)
			if candidateScore > score {
				score = candidateScore
				candidateValue = lookup
			}
		}
		if score > bestScore {
			bestScore = score
			best = candidate
			bestValue = candidateValue
		}
		if score >= 260 {
			suggestions = appendRankedOption(suggestions, candidate.Name, score, 3)
		}
	}
	if best.ID > 0 && bestScore >= 500 {
		mode := "plan_fuzzy"
		for _, keyword := range splitLookupValues(best.TriggerKeywords) {
			if normalizeLookupToken(keyword) == normalizeLookupToken(bestValue) {
				mode = "plan_keyword_match"
				break
			}
		}
		if mode == "plan_fuzzy" {
			for _, alias := range splitLookupValues(best.AliasList) {
				if normalizeLookupToken(alias) == normalizeLookupToken(bestValue) {
					mode = "plan_alias_match"
					break
				}
			}
		}
		if mode == "plan_fuzzy" && normalizeLookupToken(bestValue) == normalizeLookupToken(best.Name) {
			mode = "plan_name_match"
		}
		return best, matchCandidate{
			Mode:        mode,
			Score:       bestScore,
			Candidate:   bestValue,
			Explanation: fmt.Sprintf("计划通过「%s」命中「%s」", bestValue, best.Name),
		}, nil
	}

	planNames := make([]string, 0, len(plans))
	for _, candidate := range plans {
		planNames = append(planNames, candidate.Name)
	}
	candidateText := formatCandidateOptions(rankedOptionLabels(suggestions))
	if candidateText != "" {
		return InspectionPlan{}, matchCandidate{}, fmt.Errorf("未完全命中巡检计划「%s」。请确认是否想执行：%s", query, candidateText)
	}
	return InspectionPlan{}, matchCandidate{}, fmt.Errorf("未命中巡检计划「%s」，当前可用计划: %s", query, formatNameList(planNames))
}

func (app *App) listBoundPlans(storeID uint) ([]InspectionPlan, error) {
	var plans []InspectionPlan
	err := app.db.Model(&InspectionPlan{}).
		Distinct("inspection_plans.id, inspection_plans.name, inspection_plans.code, inspection_plans.alias_list, inspection_plans.trigger_keywords, inspection_plans.plan_type, inspection_plans.description, inspection_plans.frame_pick_mode, inspection_plans.match_threshold_percent, inspection_plans.difference_threshold_percent, inspection_plans.enabled, inspection_plans.created_at, inspection_plans.updated_at").
		Joins("JOIN store_plan_bindings ON store_plan_bindings.plan_id = inspection_plans.id AND store_plan_bindings.enabled = ?", true).
		Where("store_plan_bindings.store_id = ? AND inspection_plans.enabled = ?", storeID, true).
		Order("inspection_plans.id ASC").
		Find(&plans).Error
	return plans, err
}

func (app *App) listBindingsForStorePlan(storeID uint, planID uint) ([]StorePlanBinding, error) {
	var bindings []StorePlanBinding
	err := app.db.Preload("Store").Preload("Plan").Preload("Stream").
		Where("store_id = ? AND plan_id = ? AND enabled = ?", storeID, planID, true).
		Order("priority desc, updated_at desc, id asc").
		Find(&bindings).Error
	return bindings, err
}

func (app *App) listBatchStores(req batchExecutionRequest) ([]Store, error) {
	db := app.db.Model(&Store{}).Where("status = ?", "enabled")
	if len(req.StoreIDs) > 0 {
		db = db.Where("id IN ?", req.StoreIDs)
	}
	if strings.TrimSpace(req.Region) != "" {
		db = db.Where("region = ?", strings.TrimSpace(req.Region))
	}
	managerName, managerWecomUserID := resolveBatchManagerScope(req)
	if managerWecomUserID != "" {
		db = db.Where("manager_wecom_user_id = ?", managerWecomUserID)
	} else if managerName != "" {
		db = db.Where("manager_name = ?", managerName)
	}
	var stores []Store
	if err := db.Order("id asc").Find(&stores).Error; err != nil {
		return nil, err
	}
	return stores, nil
}

func estimateBatchDurationSeconds(storeCount int, jobCount int, planItemCount int) int {
	baseSeconds := 2
	perJobSeconds := 4
	perTenItemsSeconds := 1
	if jobCount <= 0 {
		return baseSeconds
	}
	parallelism := 3
	seconds := baseSeconds
	seconds += int((float64(jobCount*perJobSeconds) / float64(parallelism)) + 0.999)
	seconds += int((float64(planItemCount*perTenItemsSeconds) / 10.0 / float64(parallelism)) + 0.999)
	if storeCount >= 10 {
		seconds += 8
	} else if storeCount >= 5 {
		seconds += 4
	}
	if seconds < 2 {
		return 2
	}
	return seconds
}

func formatEstimatedDurationLabel(seconds int) string {
	switch {
	case seconds <= 10:
		return fmt.Sprintf("%d-%d 秒", maxInt(seconds-2, 2), maxInt(seconds, 3))
	case seconds < 60:
		return fmt.Sprintf("%d-%d 秒", maxInt(seconds-5, 10), seconds+8)
	default:
		minutes := int((float64(seconds) / 60.0) + 0.999)
		maxMinutes := minutes + 2
		if maxMinutes < 2 {
			maxMinutes = 2
		}
		return fmt.Sprintf("%d-%d 分钟", maxInt(minutes, 1), maxMinutes)
	}
}

func normalizeExecutionMode(mode string) string {
	switch strings.TrimSpace(mode) {
	case "sample":
		return "sample"
	default:
		return "full"
	}
}

func normalizedSampleSize(size int) int {
	if size < 0 {
		return 0
	}
	return size
}

func detectBatchScopeType(req batchExecutionRequest) string {
	managerName, managerWecomUserID := resolveBatchManagerScope(req)
	switch {
	case managerWecomUserID != "" || managerName != "":
		return "manager"
	case strings.TrimSpace(req.Region) != "":
		return "region"
	case len(req.StoreIDs) > 0:
		return "store_selection"
	default:
		return "all_enabled_stores"
	}
}

func detectBatchScopeValue(req batchExecutionRequest) string {
	switch detectBatchScopeType(req) {
	case "manager":
		managerName, managerWecomUserID := resolveBatchManagerScope(req)
		if managerWecomUserID != "" && managerName != "" {
			return fmt.Sprintf("%s (%s)", managerName, managerWecomUserID)
		}
		return valueOr(managerName, managerWecomUserID)
	case "region":
		return strings.TrimSpace(req.Region)
	case "store_selection":
		return fmt.Sprintf("%d 家门店", len(req.StoreIDs))
	default:
		return "全部启用门店"
	}
}

func countUniqueTargetStores(targets []batchExecutionTarget) int {
	storeIDs := make(map[uint]struct{}, len(targets))
	for _, target := range targets {
		storeIDs[target.Store.ID] = struct{}{}
	}
	return len(storeIDs)
}

func sampleStores(stores []Store, sampleSize int) []Store {
	if len(stores) == 0 {
		return nil
	}
	size := normalizedSampleSize(sampleSize)
	if size <= 0 {
		size = minInt(len(stores), 3)
	}
	if len(stores) <= size {
		return append([]Store(nil), stores...)
	}
	copied := append([]Store(nil), stores...)
	randomizer := rand.New(rand.NewSource(time.Now().UnixNano()))
	randomizer.Shuffle(len(copied), func(i int, j int) {
		copied[i], copied[j] = copied[j], copied[i]
	})
	return copied[:size]
}

func buildBatchSummaryText(planName string, selectedStores int, matchedStores int, totalJobs int, successJobs int, alertedJobs int, errorJobs int) string {
	if totalJobs == 0 {
		return fmt.Sprintf("批次使用计划「%s」，当前还没有可执行任务。", planName)
	}
	return fmt.Sprintf("批次使用计划「%s」，覆盖 %d 家已选门店，命中 %d 家门店，共 %d 条任务；当前通过 %d 条、告警 %d 条、失败 %d 条。", planName, selectedStores, matchedStores, totalJobs, successJobs, alertedJobs, errorJobs)
}

func (app *App) refreshBatchForJob(job InspectionJob) {
	if job.BatchID == nil || *job.BatchID == 0 {
		return
	}
	_ = app.refreshBatchExecutionRun(*job.BatchID)
}

func (app *App) refreshBatchExecutionRun(batchID uint) error {
	var batch BatchExecutionRun
	if err := app.db.First(&batch, batchID).Error; err != nil {
		return err
	}
	var jobs []InspectionJob
	if err := app.db.Where("batch_id = ?", batchID).Find(&jobs).Error; err != nil {
		return err
	}
	pendingJobs := 0
	runningJobs := 0
	successJobs := 0
	alertedJobs := 0
	partialSuccessJobs := 0
	errorJobs := 0
	uniqueStores := map[uint]struct{}{}
	for _, job := range jobs {
		uniqueStores[job.StoreID] = struct{}{}
		switch strings.TrimSpace(job.Status) {
		case "pending":
			pendingJobs++
		case "running":
			runningJobs++
		case "success":
			successJobs++
		case "alerted":
			alertedJobs++
		case "partial_success":
			partialSuccessJobs++
		case "error":
			errorJobs++
		}
	}
	status := "pending"
	finishedAt := (*time.Time)(nil)
	switch {
	case len(jobs) == 0:
		status = "pending"
	case pendingJobs == len(jobs):
		status = "pending"
	case pendingJobs > 0 || runningJobs > 0:
		status = "running"
	case errorJobs == len(jobs):
		status = "error"
	case errorJobs > 0 || partialSuccessJobs > 0:
		status = "partial_success"
	case alertedJobs > 0:
		status = "alerted"
	default:
		status = "success"
	}
	if pendingJobs == 0 && runningJobs == 0 {
		now := time.Now()
		finishedAt = &now
	}
	return app.db.Model(&BatchExecutionRun{ID: batchID}).Updates(map[string]interface{}{
		"matched_store_count":  len(uniqueStores),
		"total_jobs":           len(jobs),
		"pending_jobs":         pendingJobs,
		"running_jobs":         runningJobs,
		"success_jobs":         successJobs,
		"alerted_jobs":         alertedJobs,
		"partial_success_jobs": partialSuccessJobs,
		"error_jobs":           errorJobs,
		"status":               status,
		"summary_text":         buildBatchSummaryText(batch.PlanName, batch.SelectedStoreCount, len(uniqueStores), len(jobs), successJobs, alertedJobs, errorJobs),
		"finished_at":          finishedAt,
	}).Error
}

func (app *App) findBindingByStoreAndPlan(storeID uint, planID uint) (StorePlanBinding, error) {
	var binding StorePlanBinding
	err := app.db.Preload("Store").Preload("Plan").Preload("Stream").
		Where("store_id = ? AND plan_id = ? AND enabled = ?", storeID, planID, true).
		Order("priority desc, updated_at desc, id asc").
		First(&binding).Error
	return binding, err
}

func (app *App) findDefaultBindingForStore(storeID uint) (StorePlanBinding, error) {
	var binding StorePlanBinding
	err := app.db.Preload("Store").Preload("Plan").Preload("Stream").
		Where("store_id = ? AND enabled = ?", storeID, true).
		Order("priority desc, updated_at desc, id asc").
		First(&binding).Error
	return binding, err
}

func (app *App) findStreamBySourceQuery(query string, storeID uint) (StoreStream, matchCandidate, error) {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return StoreStream{}, matchCandidate{}, errors.New("监控模块查询不能为空")
	}
	db := app.db.Preload("Store").Where("enabled = ?", true)
	if storeID > 0 {
		db = db.Where("store_id = ?", storeID)
	}

	var exact StoreStream
	if err := db.Where("stream_url = ? OR source_alias = ? OR name = ?", trimmed, trimmed, trimmed).First(&exact).Error; err == nil {
		return exact, matchCandidate{
			Mode:        "stream_exact",
			Score:       1200,
			Candidate:   trimmed,
			Explanation: fmt.Sprintf("监控模块按流地址/名称精确命中「%s」", exact.Name),
		}, nil
	}

	var streams []StoreStream
	if err := db.Find(&streams).Error; err != nil {
		return StoreStream{}, matchCandidate{}, err
	}
	bestScore := 0
	var best StoreStream
	bestValue := ""
	for _, stream := range streams {
		for _, candidate := range streamLookupCandidates(stream) {
			score := scoreLookupCandidate(trimmed, candidate)
			if score > bestScore {
				bestScore = score
				best = stream
				bestValue = candidate
			}
		}
	}
	if best.ID > 0 && bestScore >= 500 {
		mode := "stream_fuzzy"
		if normalizeLookupToken(bestValue) == normalizeLookupToken(best.Name) {
			mode = "stream_name_match"
		}
		for _, alias := range splitLookupValues(best.AliasList) {
			if normalizeLookupToken(alias) == normalizeLookupToken(bestValue) {
				mode = "stream_alias_match"
				break
			}
		}
		if mode == "stream_fuzzy" && normalizeLookupToken(bestValue) == normalizeLookupToken(best.SourceAlias) {
			mode = "stream_source_alias_match"
		}
		return best, matchCandidate{
			Mode:        mode,
			Score:       bestScore,
			Candidate:   bestValue,
			Explanation: fmt.Sprintf("监控模块通过「%s」命中「%s」", bestValue, best.Name),
		}, nil
	}
	return StoreStream{}, matchCandidate{}, fmt.Errorf("未命中监控模块/流地址「%s」", trimmed)
}

func (app *App) findBindingForExecution(store Store, plan InspectionPlan, streamQuery string) (StorePlanBinding, matchCandidate, error) {
	var bindings []StorePlanBinding
	if err := app.db.Preload("Store").Preload("Plan").Preload("Stream").
		Where("store_id = ? AND plan_id = ? AND enabled = ?", store.ID, plan.ID, true).
		Order("priority desc, updated_at desc, id asc").
		Find(&bindings).Error; err != nil {
		return StorePlanBinding{}, matchCandidate{}, err
	}
	if len(bindings) == 0 {
		return StorePlanBinding{}, matchCandidate{}, errors.New("门店未绑定对应巡检计划")
	}
	if strings.TrimSpace(streamQuery) == "" {
		return bindings[0], matchCandidate{
			Mode:        "binding_priority",
			Score:       1000 + bindings[0].Priority,
			Candidate:   bindings[0].Stream.Name,
			Explanation: fmt.Sprintf("按绑定优先级选择监控模块「%s」", bindings[0].Stream.Name),
		}, nil
	}
	bestScore := 0
	var best StorePlanBinding
	bestValue := ""
	for _, binding := range bindings {
		for _, candidate := range streamLookupCandidates(binding.Stream) {
			score := scoreLookupCandidate(streamQuery, candidate)
			if score > bestScore {
				bestScore = score
				best = binding
				bestValue = candidate
			}
		}
	}
	if best.ID > 0 && bestScore >= 500 {
		return best, matchCandidate{
			Mode:        "binding_stream_match",
			Score:       bestScore,
			Candidate:   bestValue,
			Explanation: fmt.Sprintf("按监控模块命中绑定「%s」", best.Stream.Name),
		}, nil
	}
	return StorePlanBinding{}, matchCandidate{}, fmt.Errorf("门店「%s」计划「%s」下未命中监控模块「%s」", store.Name, plan.Name, strings.TrimSpace(streamQuery))
}

func (app *App) findPlanForStore(store Store, requestedPlanName string, requestedStoreName string) (InspectionPlan, matchCandidate, error) {
	query := strings.TrimSpace(requestedPlanName)
	if query == "" {
		return InspectionPlan{}, matchCandidate{}, errors.New("巡检计划名称不能为空")
	}

	if exactPlan, trace, err := app.findPlanByNameExact(query); err == nil {
		if _, bindingErr := app.findBindingByStoreAndPlan(store.ID, exactPlan.ID); bindingErr == nil {
			return exactPlan, trace, nil
		}
		return InspectionPlan{}, matchCandidate{}, fmt.Errorf("门店「%s」未绑定巡检计划「%s」，请先在后台绑定后再执行", store.Name, exactPlan.Name)
	}

	return app.findBoundPlanByNameLike(store, query, requestedStoreName)
}

func (app *App) findBoundPlanByNameLike(store Store, requestedPlanName string, requestedStoreName string) (InspectionPlan, matchCandidate, error) {
	query := strings.TrimSpace(requestedPlanName)
	if query == "" {
		return InspectionPlan{}, matchCandidate{}, errors.New("巡检计划名称不能为空")
	}
	plans, err := app.listBoundPlans(store.ID)
	if err != nil {
		return InspectionPlan{}, matchCandidate{}, err
	}
	if len(plans) == 0 {
		return InspectionPlan{}, matchCandidate{}, fmt.Errorf("门店「%s」暂无已绑定的巡检计划", store.Name)
	}
	planTypeHint := inferPlanTypeHint(query, requestedStoreName)
	queryCandidates := dedupeLookupValues([]string{query})
	bestScore := 0
	var best InspectionPlan
	bestValue := ""
	suggestions := make([]rankedOption, 0, 3)
	for _, plan := range plans {
		score := 0
		candidateValue := ""
		for _, queryCandidate := range queryCandidates {
			for _, candidate := range planLookupCandidates(plan) {
				candidateScore := scoreLookupCandidate(queryCandidate, candidate)
				if candidateScore > score {
					score = candidateScore
					candidateValue = candidate
				}
			}
		}
		if score > 0 && planTypeHint != "" && strings.TrimSpace(plan.PlanType) == planTypeHint {
			score += 120
		}
		if score > 0 && normalizeLookupToken(query) == normalizeLookupToken(requestedStoreName) && strings.TrimSpace(plan.PlanType) == "description_inspection" {
			score += 160
		}
		if score > 0 && strings.TrimSpace(plan.PlanType) == "description_inspection" && containsInspectionKeywords(plan.Name) {
			score += 40
		}
		if score > bestScore {
			bestScore = score
			best = plan
			bestValue = candidateValue
		}
		if score >= 260 {
			suggestions = appendRankedOption(suggestions, plan.Name, score, 3)
		}
	}
	if best.ID > 0 && bestScore >= 500 {
		mode := "plan_bound_fuzzy"
		if normalizeLookupToken(bestValue) == normalizeLookupToken(best.Name) {
			mode = "plan_bound_name_match"
		}
		for _, alias := range splitLookupValues(best.AliasList) {
			if normalizeLookupToken(alias) == normalizeLookupToken(bestValue) {
				mode = "plan_bound_alias_match"
				break
			}
		}
		for _, keyword := range splitLookupValues(best.TriggerKeywords) {
			if normalizeLookupToken(keyword) == normalizeLookupToken(bestValue) {
				mode = "plan_bound_keyword_match"
				break
			}
		}
		return best, matchCandidate{
			Mode:        mode,
			Score:       bestScore,
			Candidate:   bestValue,
			Explanation: fmt.Sprintf("门店「%s」下通过「%s」命中计划「%s」", store.Name, bestValue, best.Name),
		}, nil
	}
	planNames := make([]string, 0, len(plans))
	for _, plan := range plans {
		planNames = append(planNames, plan.Name)
	}
	candidateText := formatCandidateOptions(rankedOptionLabels(suggestions))
	if candidateText != "" {
		return InspectionPlan{}, matchCandidate{}, fmt.Errorf("门店「%s」下未完全命中巡检计划「%s」。请确认是否想执行：%s", store.Name, query, candidateText)
	}
	return InspectionPlan{}, matchCandidate{}, fmt.Errorf("门店「%s」未命中巡检计划「%s」，当前可用计划: %s", store.Name, query, formatNameList(planNames))
}

func (app *App) currentConfigVersion() string {
	latest := time.Time{}
	models := []interface{}{
		&Store{},
		&StoreStream{},
		&InspectionPlan{},
		&StorePlanBinding{},
	}
	for _, model := range models {
		var item struct {
			UpdatedAt time.Time
		}
		if err := app.db.Model(model).Select("updated_at").Order("updated_at desc").Limit(1).Scan(&item).Error; err != nil {
			continue
		}
		if item.UpdatedAt.After(latest) {
			latest = item.UpdatedAt
		}
	}
	if latest.IsZero() {
		return "bootstrap"
	}
	return latest.UTC().Format(time.RFC3339)
}

func (app *App) writeMatchLog(req executeContextRequest, trace resolveTrace, store *Store, plan *InspectionPlan, stream *StoreStream, binding *StorePlanBinding, jobID *uint) {
	logItem := InspectionMatchLog{
		QueryText:          strings.TrimSpace(trace.QueryText),
		NormalizedQuery:    normalizeLookupToken(trace.QueryText),
		RequestedStoreName: strings.TrimSpace(req.StoreName),
		RequestedPlanName:  strings.TrimSpace(req.PlanName),
		RequestedStreamName: strings.TrimSpace(req.StreamName),
		RequestedSource:    strings.TrimSpace(req.Source),
		StoreMatchMode:     trace.StoreMatch.Mode,
		PlanMatchMode:      trace.PlanMatch.Mode,
		StreamMatchMode:    trace.StreamMatch.Mode,
		BindingMatchMode:   trace.BindingMatch.Mode,
		ConfidenceScore:    bestConfidence(trace.StoreMatch.Score, trace.PlanMatch.Score, trace.StreamMatch.Score, trace.BindingMatch.Score),
		ConfigVersion:      strings.TrimSpace(trace.ConfigVersion),
		DecisionSummary:    strings.TrimSpace(trace.DecisionSummary),
		ErrorMessage:       strings.TrimSpace(trace.ErrorMessage),
	}
	if jobID != nil && *jobID > 0 {
		logItem.JobID = jobID
	}
	if store != nil {
		logItem.MatchedStoreID = store.ID
		logItem.MatchedStoreName = store.Name
	}
	if plan != nil {
		logItem.MatchedPlanID = plan.ID
		logItem.MatchedPlanName = plan.Name
	}
	if stream != nil {
		logItem.MatchedStreamID = stream.ID
		logItem.MatchedStreamName = stream.Name
	}
	if binding != nil {
		logItem.MatchedBindingID = binding.ID
	}
	_ = app.db.Create(&logItem).Error
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

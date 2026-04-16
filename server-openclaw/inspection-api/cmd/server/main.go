package main

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Config struct {
	Port           string
	DatabaseDriver string
	DatabaseDSN    string
	AllowedOrigins []string
	OpenAPIHost    string
	OpenAPIAID     string
	OpenAPIAKey    string
	OpenAPISecret  string
	BossAPIHost    string
	BossAuthHost   string
	BossOVOAuth    string
	BossCookie     string
	BossReferer    string
	BossGroupID    string
	BossUsername   string
	BossPassword   string
	BossDeviceID   string
	BossDeviceName string
	BossNationCode string
}

type App struct {
	cfg         Config
	db          *gorm.DB
	bossSession *bossSessionManager
}

var storeAliasMap = map[string][]string{}

type APIResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type Store struct {
	ID                 uint      `json:"id" gorm:"primaryKey"`
	Name               string    `json:"name"`
	Code               string    `json:"code"`
	AliasList          string    `json:"aliasList"`
	Region             string    `json:"region"`
	Status             string    `json:"status"`
	ManagerName        string    `json:"managerName"`
	ManagerWecomUserID string    `json:"managerWecomUserId"`
	Remark             string    `json:"remark"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
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
	ID                         uint      `json:"id" gorm:"primaryKey"`
	Name                       string    `json:"name"`
	Code                       string    `json:"code"`
	AliasList                  string    `json:"aliasList"`
	TriggerKeywords            string    `json:"triggerKeywords"`
	PlanType                   string    `json:"planType"`
	Description                string    `json:"description"`
	FramePickMode              string    `json:"framePickMode"`
	MatchThresholdPercent      float64   `json:"matchThresholdPercent"`
	DifferenceThresholdPercent float64   `json:"differenceThresholdPercent"`
	Enabled                    bool      `json:"enabled"`
	CreatedAt                  time.Time `json:"createdAt"`
	UpdatedAt                  time.Time `json:"updatedAt"`
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
	ID                               uint           `json:"id" gorm:"primaryKey"`
	StoreID                          uint           `json:"storeId"`
	Store                            Store          `json:"store"`
	PlanID                           uint           `json:"planId"`
	Plan                             InspectionPlan `json:"plan"`
	StreamID                         uint           `json:"streamId"`
	Stream                           StoreStream    `json:"stream"`
	CustomMatchThresholdPercent      float64        `json:"customMatchThresholdPercent"`
	CustomDifferenceThresholdPercent float64        `json:"customDifferenceThresholdPercent"`
	Enabled                          bool           `json:"enabled"`
	CreatedAt                        time.Time      `json:"createdAt"`
	UpdatedAt                        time.Time      `json:"updatedAt"`
}

type InspectionJob struct {
	ID                  uint              `json:"id" gorm:"primaryKey"`
	JobNo               string            `json:"jobNo"`
	StoreID             uint              `json:"storeId"`
	Store               Store             `json:"store"`
	PlanID              uint              `json:"planId"`
	Plan                InspectionPlan    `json:"plan"`
	BindingID           uint              `json:"bindingId"`
	Binding             StorePlanBinding  `json:"binding,omitempty" gorm:"foreignKey:BindingID"`
	TriggerType         string            `json:"triggerType"`
	TriggerSource       string            `json:"triggerSource"`
	OperatorName        string            `json:"operatorName"`
	OperatorWecomUserID string            `json:"operatorWecomUserId"`
	Status              string            `json:"status"`
	StartedAt           *time.Time        `json:"startedAt"`
	FinishedAt          *time.Time        `json:"finishedAt"`
	ErrorMessage        string            `json:"errorMessage"`
	CreatedAt           time.Time         `json:"createdAt"`
	UpdatedAt           time.Time         `json:"updatedAt"`
	Result              *InspectionResult `json:"result,omitempty" gorm:"foreignKey:JobID"`
}

type InspectionResult struct {
	ID                         uint                   `json:"id" gorm:"primaryKey"`
	JobID                      uint                   `json:"jobId"`
	StoreName                  string                 `json:"storeName"`
	PlanName                   string                 `json:"planName"`
	MonitorName                string                 `json:"monitorName"`
	Source                     string                 `json:"source"`
	InspectionType             string                 `json:"inspectionType"`
	FramePickMode              string                 `json:"framePickMode"`
	SampledAtSeconds           float64                `json:"sampledAtSeconds"`
	Verdict                    string                 `json:"verdict"`
	MatchPercent               float64                `json:"matchPercent"`
	DifferencePercent          float64                `json:"differencePercent"`
	ObservedSummary            string                 `json:"observedSummary"`
	FallbackUsed               bool                   `json:"fallbackUsed"`
	FallbackReason             string                 `json:"fallbackReason"`
	PluginRecommendation       string                 `json:"pluginRecommendation"`
	PluginRecommendationReason string                 `json:"pluginRecommendationReason"`
	ReportURL                  string                 `json:"reportUrl"`
	DocURL                     string                 `json:"docUrl"`
	CreatedAt                  time.Time              `json:"createdAt"`
	Items                      []InspectionResultItem `json:"items,omitempty" gorm:"foreignKey:ResultID"`
	Artifacts                  []InspectionArtifact   `json:"artifacts,omitempty" gorm:"foreignKey:ResultID"`
}

type InspectionResultItem struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	ResultID   uint      `json:"resultId"`
	Clause     string    `json:"clause"`
	ClauseType string    `json:"clauseType"`
	Matched    bool      `json:"matched"`
	Evidence   string    `json:"evidence"`
	CreatedAt  time.Time `json:"createdAt"`
}

type InspectionArtifact struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	ResultID     uint      `json:"resultId"`
	ArtifactType string    `json:"artifactType"`
	FileURL      string    `json:"fileUrl"`
	FilePath     string    `json:"filePath"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Schedule struct {
	ID        uint       `json:"id" gorm:"primaryKey"`
	StoreID   uint       `json:"storeId"`
	PlanID    uint       `json:"planId"`
	CronExpr  string     `json:"cronExpr"`
	Enabled   bool       `json:"enabled"`
	LastRunAt *time.Time `json:"lastRunAt"`
	NextRunAt *time.Time `json:"nextRunAt"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

type AlertRule struct {
	ID            uint      `json:"id" gorm:"primaryKey"`
	StoreID       uint      `json:"storeId"`
	PlanID        uint      `json:"planId"`
	ChannelType   string    `json:"channelType"`
	TargetID      string    `json:"targetId"`
	MentionUserID string    `json:"mentionUserId"`
	Enabled       bool      `json:"enabled"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type executeContextRequest struct {
	StoreID   uint   `json:"storeId"`
	StoreName string `json:"storeName"`
	PlanID    uint   `json:"planId"`
	PlanName  string `json:"planName"`
	Source    string `json:"source"`
}

type manualExecutionRequest struct {
	StoreID             uint   `json:"storeId"`
	StoreName           string `json:"storeName"`
	PlanID              uint   `json:"planId"`
	PlanName            string `json:"planName"`
	Source              string `json:"source"`
	OperatorName        string `json:"operatorName"`
	OperatorWecomUserID string `json:"operatorWecomUserId"`
	TriggerType         string `json:"triggerType"`
	TriggerSource       string `json:"triggerSource"`
}

type inspectionResultCreateRequest struct {
	JobID                      uint                   `json:"jobId"`
	StoreName                  string                 `json:"storeName"`
	PlanName                   string                 `json:"planName"`
	MonitorName                string                 `json:"monitorName"`
	Source                     string                 `json:"source"`
	InspectionType             string                 `json:"inspectionType"`
	FramePickMode              string                 `json:"framePickMode"`
	SampledAtSeconds           float64                `json:"sampledAtSeconds"`
	Verdict                    string                 `json:"verdict"`
	MatchPercent               float64                `json:"matchPercent"`
	DifferencePercent          float64                `json:"differencePercent"`
	ObservedSummary            string                 `json:"observedSummary"`
	FallbackUsed               bool                   `json:"fallbackUsed"`
	FallbackReason             string                 `json:"fallbackReason"`
	PluginRecommendation       string                 `json:"pluginRecommendation"`
	PluginRecommendationReason string                 `json:"pluginRecommendationReason"`
	ReportURL                  string                 `json:"reportUrl"`
	DocURL                     string                 `json:"docUrl"`
	Items                      []InspectionResultItem `json:"items"`
	Artifacts                  []InspectionArtifact   `json:"artifacts"`
}

type openPlatformTokenRequest struct {
	IdentifierType  string `json:"identifierType"`
	IdentifierValue string `json:"identifierValue"`
}

type bossLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type openPlatformTokenResponse struct {
	Token          string          `json:"token"`
	EnterpriseID   interface{}     `json:"enterpriseId,omitempty"`
	IdentifierType string          `json:"identifierType"`
	Identifier     string          `json:"identifier"`
	Raw            json.RawMessage `json:"raw,omitempty"`
}

type ovoPlatformResponse struct {
	Code int             `json:"code"`
	Data json.RawMessage `json:"data"`
	Stat struct {
		Code     int    `json:"code"`
		CodeName string `json:"codename"`
	} `json:"stat"`
	GatewayParam struct {
		Result string `json:"result"`
	} `json:"gatewayParam"`
}

type bossDepartmentTreeRequest struct {
	GroupID        string `json:"groupId"`
	ID             string `json:"id"`
	ShowClosedShop *bool  `json:"showClosedShop"`
	ShowShopCount  *bool  `json:"showShopCount"`
	IsQueryAll     *int   `json:"isQueryAll"`
	IsAddDevNode   *int   `json:"isAddDevNode"`
	ShowType       *int   `json:"showType"`
	ModuleID       *int   `json:"moduleId"`
	OrderByTime    *bool  `json:"orderByTime"`
	OrderByAsc     *bool  `json:"orderByAsc"`
}

type bossDepartmentTreeNode struct {
	ID             string `json:"id"`
	PID            string `json:"pid"`
	Text           string `json:"text"`
	ShopID         string `json:"shopId"`
	OpenStatus     int    `json:"openStatus"`
	ValidateStatus int    `json:"validateStatus"`
	DeviceCount    int    `json:"deviceCount"`
	DepartmentType *int   `json:"departmentType"`
	IsConfig       int    `json:"isConfig"`
	Attributes     struct {
		Level     int      `json:"level"`
		Latitude  *float64 `json:"latitude"`
		Longitude *float64 `json:"longitude"`
		TimeZone  int      `json:"timeZone"`
	} `json:"attributes"`
}

type bossDepartmentTreeResponse struct {
	IsError bool                     `json:"isError"`
	Data    []bossDepartmentTreeNode `json:"data"`
}

type bossDeptDeviceListRequest struct {
	GroupID        string `form:"groupId" json:"groupId"`
	ID             string `form:"id" json:"id"`
	DeptID         string `form:"deptId" json:"deptId"`
	ShowClosedShop *bool  `form:"showClosedShop" json:"showClosedShop"`
	ShowShopCount  *bool  `form:"showShopCount" json:"showShopCount"`
	IsQueryAll     *int   `form:"isQueryAll" json:"isQueryAll"`
	IsAddDevNode   *int   `form:"isAddDevNode" json:"isAddDevNode"`
	ShowType       *int   `form:"showType" json:"showType"`
	ModuleID       *int   `form:"moduleId" json:"moduleId"`
	OrderByTime    *bool  `form:"orderByTime" json:"orderByTime"`
	OrderByAsc     *bool  `form:"orderByAsc" json:"orderByAsc"`
}

type bossDeviceItem struct {
	SupportDownloadCallBackFlag int    `json:"supportDownloadCallBackFlag"`
	GroupID                     int    `json:"groupId"`
	DeptID                      int    `json:"deptId"`
	DeviceID                    int    `json:"deviceId"`
	DeviceStatusID              int    `json:"deviceStatusId"`
	Online                      int    `json:"online"`
	OfflineTimeStamp            *int64 `json:"offlineTimeStamp"`
	ThirdPartType               int    `json:"thirdPartType"`
	SlaveFlag                   int    `json:"slaveFlag"`
	DeviceName                  string `json:"deviceName"`
	SupportMultiPlay            int    `json:"supportMultiPlay"`
	CanPtzFlag                  int    `json:"canPtzFlag"`
	AccessType                  int    `json:"accessType"`
	SettingEnable               int    `json:"settingEnable"`
	DevIcon                     string `json:"devIcon"`
	ThumbURL                    string `json:"thumbUrl"`
	MainIPC                     int    `json:"mainIpc"`
	YzsDepOutIpcFlag            int    `json:"yzsDepOutIpcFlag"`
	SupportVideoPlayback        int    `json:"supportVideoPlayback"`
	SceneBySnap                 int    `json:"sceneBySnap"`
	Status                      int    `json:"status"`
	PTZEnable                   int    `json:"ptzEnable"`
	ID                          int    `json:"id"`
	Name                        string `json:"name"`
	ThirdpartType               int    `json:"thirdpartType"`
	DType                       int    `json:"dtype"`
}

type bossDeviceListResponse struct {
	IsError bool             `json:"isError"`
	Data    []bossDeviceItem `json:"data"`
	Code    string           `json:"code"`
	Message string           `json:"message"`
}

type bossVideoPlayRequest struct {
	DeviceID           int `json:"deviceId"`
	IsSlave            int `json:"isSlave"`
	RealPlayType       int `json:"realPlayType"`
	PlayCloudMediaFlag int `json:"playCloudMediaFlag"`
}

type bossVideoPlayData struct {
	DeviceID          int    `json:"deviceId"`
	Name              string `json:"name"`
	Flv               string `json:"flv"`
	TLSFlv            string `json:"tlsflv"`
	TLSHls            string `json:"tlshls"`
	URL               string `json:"url"`
	NetworkQualityURL string `json:"networkQualityQryAddr"`
	SessionID         string `json:"sessionId"`
}

type bossVideoPlayResponse struct {
	IsError bool              `json:"isError"`
	Data    bossVideoPlayData `json:"data"`
	Code    string            `json:"code"`
	Message string            `json:"message"`
}

type bossVideoSessionResponse struct {
	DeviceID          int             `json:"deviceId"`
	Name              string          `json:"name"`
	StreamURL         string          `json:"streamUrl"`
	HlsURL            string          `json:"hlsUrl,omitempty"`
	SessionID         string          `json:"sessionId,omitempty"`
	NetworkQualityURL string          `json:"networkQualityUrl,omitempty"`
	Raw               json.RawMessage `json:"raw,omitempty"`
}

type bossAuthResponse struct {
	IsError bool   `json:"isError"`
	Code    string `json:"code"`
	Message string `json:"message"`
	Data    struct {
		Token                      string `json:"token"`
		TokenExpirationTimestamp   int64  `json:"tokenExpirationTimestamp"`
		RefreshExpirationTimestamp int64  `json:"refreshExpirationTimestamp"`
		EnterpriseID               int64  `json:"enterpriseId"`
		GroupID                    int64  `json:"groupId"`
		UserID                     int64  `json:"userId"`
		UserName                   string `json:"userName"`
		NationalCode               string `json:"nationalCode"`
		TokenExpirationSurplus     int64  `json:"tokenExpirationSurplusTimestamp"`
		RefreshExpirationSurplus   int64  `json:"refreshExpirationSurplusTimestamp"`
	} `json:"data"`
}

type bossSessionSnapshot struct {
	Token                string
	TokenValidity        int64
	RefreshTokenValidity int64
	GroupID              string
	UserID               string
	UserName             string
}

type bossSessionManager struct {
	cfg    Config
	client *http.Client
	mu     sync.Mutex
	state  *bossSessionSnapshot
}

func main() {
	cfg := loadConfig()
	db := mustOpenDatabase(cfg)
	mustMigrate(db)
	mustSeed(db)

	app := &App{cfg: cfg, db: db}
	if cfg.BossUsername != "" && cfg.BossPassword != "" {
		app.bossSession = mustNewBossSessionManager(cfg)
	}

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
		api.POST("/open-platform/auth/token", app.getOpenPlatformToken)
		api.POST("/boss/session/login", app.loginBossSession)
		api.POST("/boss/departments/tree", app.getBossDepartmentsTree)
		api.GET("/boss/devices/dept", app.getBossDeptDevices)
		api.POST("/boss/video/play", app.startBossVideoPlay)
		api.GET("/boss/video/stream", app.proxyBossVideoStream)
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
	openAPIHost := strings.TrimSpace(os.Getenv("OVOPARK_OPEN_API_HOST"))
	if openAPIHost == "" {
		openAPIHost = "http://cloudapi.ovopark.com/cloud.api"
	}
	bossAPIHost := strings.TrimSpace(os.Getenv("OVOPARK_BOSS_API_HOST"))
	if bossAPIHost == "" {
		bossAPIHost = "https://boss.ovopark.com"
	}
	bossAuthHost := strings.TrimSpace(os.Getenv("OVOPARK_BOSS_AUTH_HOST"))
	if bossAuthHost == "" {
		bossAuthHost = "https://www.ovopark.com"
	}
	bossReferer := strings.TrimSpace(os.Getenv("OVOPARK_BOSS_REFERER"))
	if bossReferer == "" {
		bossReferer = "https://boss.ovopark.com/patrol-shop/index.html/patrol"
	}
	bossDeviceID := strings.TrimSpace(os.Getenv("OVOPARK_BOSS_DEVICE_ID"))
	if bossDeviceID == "" {
		sum := md5.Sum([]byte("inspection-api:" + strings.TrimSpace(os.Getenv("OVOPARK_BOSS_USERNAME"))))
		bossDeviceID = hex.EncodeToString(sum[:])
	}
	bossDeviceName := strings.TrimSpace(os.Getenv("OVOPARK_BOSS_DEVICE_NAME"))
	if bossDeviceName == "" {
		bossDeviceName = "inspection-api"
	}
	bossNationCode := strings.TrimSpace(os.Getenv("OVOPARK_BOSS_NATIONAL_CODE"))
	if bossNationCode == "" {
		bossNationCode = "86"
	}
	return Config{
		Port:           port,
		DatabaseDriver: driver,
		DatabaseDSN:    dsn,
		AllowedOrigins: allowList,
		OpenAPIHost:    openAPIHost,
		OpenAPIAID:     strings.TrimSpace(os.Getenv("OVOPARK_OPEN_API_AID")),
		OpenAPIAKey:    strings.TrimSpace(os.Getenv("OVOPARK_OPEN_API_AKEY")),
		OpenAPISecret:  strings.TrimSpace(os.Getenv("OVOPARK_OPEN_API_SECRET")),
		BossAPIHost:    bossAPIHost,
		BossAuthHost:   bossAuthHost,
		BossOVOAuth:    strings.TrimSpace(os.Getenv("OVOPARK_BOSS_OVO_AUTH")),
		BossCookie:     strings.TrimSpace(os.Getenv("OVOPARK_BOSS_COOKIE")),
		BossReferer:    bossReferer,
		BossGroupID:    strings.TrimSpace(os.Getenv("OVOPARK_BOSS_GROUP_ID")),
		BossUsername:   strings.TrimSpace(os.Getenv("OVOPARK_BOSS_USERNAME")),
		BossPassword:   strings.TrimSpace(os.Getenv("OVOPARK_BOSS_PASSWORD")),
		BossDeviceID:   bossDeviceID,
		BossDeviceName: bossDeviceName,
		BossNationCode: bossNationCode,
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
		"stream_id":                           payload.StreamID,
		"custom_match_threshold_percent":      payload.CustomMatchThresholdPercent,
		"custom_difference_threshold_percent": payload.CustomDifferenceThresholdPercent,
		"enabled":                             payload.Enabled,
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
		"channel_type":    payload.ChannelType,
		"target_id":       payload.TargetID,
		"mention_user_id": payload.MentionUserID,
		"enabled":         payload.Enabled,
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

func (app *App) getOpenPlatformToken(ctx *gin.Context) {
	if app.cfg.OpenAPIAID == "" || app.cfg.OpenAPIAKey == "" || app.cfg.OpenAPISecret == "" {
		fail(ctx, http.StatusBadRequest, "missing OVOPARK open platform config")
		return
	}

	var payload openPlatformTokenRequest
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}

	identifierType := strings.TrimSpace(payload.IdentifierType)
	identifierValue := strings.TrimSpace(payload.IdentifierValue)
	if identifierValue == "" {
		fail(ctx, http.StatusBadRequest, "identifierValue is required")
		return
	}

	allowedTypes := map[string]struct{}{
		"userId":       {},
		"loginName":    {},
		"mobilePhone":  {},
		"employeeName": {},
	}
	if _, ok := allowedTypes[identifierType]; !ok {
		fail(ctx, http.StatusBadRequest, "identifierType must be one of userId, loginName, mobilePhone, employeeName")
		return
	}

	form := url.Values{}
	form.Set("_aid", app.cfg.OpenAPIAID)
	form.Set("_akey", app.cfg.OpenAPIAKey)
	form.Set("_mt", "open.shopweb.privilege.getToken")
	form.Set("_sm", "md5")
	form.Set("_requestMode", "post")
	form.Set("_version", "v1")
	form.Set("_timestamp", time.Now().Format("20060102150405"))
	form.Set(identifierType, identifierValue)
	form.Set("_sig", buildOVOPlatformSig(form, app.cfg.OpenAPISecret))

	request, err := http.NewRequestWithContext(ctx.Request.Context(), http.MethodPost, app.cfg.OpenAPIHost, strings.NewReader(form.Encode()))
	if err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Accept", "application/json")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		fail(ctx, http.StatusBadGateway, err.Error())
		return
	}
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		fail(ctx, http.StatusBadGateway, err.Error())
		return
	}
	if response.StatusCode >= http.StatusBadRequest {
		fail(ctx, http.StatusBadGateway, string(body))
		return
	}

	var result ovoPlatformResponse
	if err := json.Unmarshal(body, &result); err != nil {
		fail(ctx, http.StatusBadGateway, err.Error())
		return
	}

	if result.Code != 0 && result.Code != 200 {
		message := strings.TrimSpace(result.GatewayParam.Result)
		if message == "" {
			message = strings.TrimSpace(result.Stat.CodeName)
		}
		if message == "" {
			message = "open platform token request failed"
		}
		fail(ctx, http.StatusBadGateway, fmt.Sprintf("%s (%d)", message, result.Code))
		return
	}

	var tokenData struct {
		Token        string      `json:"token"`
		EnterpriseID interface{} `json:"enterpriseId"`
	}
	if len(result.Data) > 0 && string(result.Data) != "null" {
		if err := json.Unmarshal(result.Data, &tokenData); err != nil {
			fail(ctx, http.StatusBadGateway, err.Error())
			return
		}
	}
	if tokenData.Token == "" {
		fail(ctx, http.StatusBadGateway, "open platform returned empty token")
		return
	}

	success(ctx, openPlatformTokenResponse{
		Token:          tokenData.Token,
		EnterpriseID:   tokenData.EnterpriseID,
		IdentifierType: identifierType,
		Identifier:     identifierValue,
		Raw:            result.Data,
	})
}

func buildOVOPlatformSig(values url.Values, secret string) string {
	parts := make([]string, 0, len(values))
	for key, items := range values {
		if key == "_sig" || key == "_format" {
			continue
		}
		for _, item := range items {
			parts = append(parts, key+item)
		}
	}
	sort.Strings(parts)
	payload := secret + strings.Join(parts, "") + secret
	sum := md5.Sum([]byte(payload))
	return strings.ToUpper(hex.EncodeToString(sum[:]))
}

func mustNewBossSessionManager(cfg Config) *bossSessionManager {
	jar, err := cookiejar.New(nil)
	if err != nil {
		panic(err)
	}

	return &bossSessionManager{
		cfg: cfg,
		client: &http.Client{
			Timeout: 20 * time.Second,
			Jar:     jar,
		},
	}
}

func (app *App) resolveBossAuth(ctx context.Context) (string, string, string, error) {
	if app.bossSession != nil {
		session, err := app.bossSession.EnsureValid(ctx)
		if err != nil {
			return "", "", "", err
		}
		groupID := strings.TrimSpace(session.GroupID)
		if groupID == "" {
			groupID = strings.TrimSpace(app.cfg.BossGroupID)
		}
		if groupID == "" {
			return "", "", "", errors.New("missing boss groupId")
		}
		return session.Token, buildBossCookie(app.cfg, session), groupID, nil
	}

	if app.cfg.BossOVOAuth == "" || app.cfg.BossCookie == "" || app.cfg.BossGroupID == "" {
		return "", "", "", errors.New("missing boss session config")
	}

	return app.cfg.BossOVOAuth, app.cfg.BossCookie, app.cfg.BossGroupID, nil
}

func buildBossAuthorization(cfg Config, token string) string {
	trimmed := strings.TrimSpace(token)
	if trimmed == "" {
		return ""
	}
	deviceName := strings.TrimSpace(cfg.BossDeviceName)
	deviceID := strings.TrimSpace(cfg.BossDeviceID)
	if deviceName == "" || deviceID == "" {
		return trimmed
	}
	return fmt.Sprintf("%s MacOS 1.0 SIMPLIFIED_CHINESE GMT+8:00 %s %s", trimmed, url.QueryEscape(deviceName), deviceID)
}

func buildBossCookie(cfg Config, session *bossSessionSnapshot) string {
	values := []string{
		"ovo_ticket=" + url.QueryEscape(session.Token),
		"ovo_tokenValidity=" + strconv.FormatInt(session.TokenValidity, 10),
		"ovo_refreshTokenValidity=" + strconv.FormatInt(session.RefreshTokenValidity, 10),
		"groupId=" + url.QueryEscape(session.GroupID),
		"ovo_userId=" + url.QueryEscape(session.UserID),
		"UserName=" + url.QueryEscape(session.UserName),
		"currLogin=1",
		"ovo_language=zh-CN",
		"ovo_referrer=" + url.QueryEscape(cfg.BossReferer),
		"ovo_loginReferrer=" + url.QueryEscape(strings.TrimRight(cfg.BossAuthHost, "/")+"/login"),
		"sourceUrl=" + url.QueryEscape(strings.TrimRight(cfg.BossAuthHost, "/")+"/login"),
	}
	if cfg.BossDeviceID != "" {
		values = append(values, "ovo_deviceSerialNo="+url.QueryEscape(cfg.BossDeviceID))
	}
	return strings.Join(values, "; ")
}

func (app *App) newBossRequest(ctx context.Context, method string, endpoint string, body io.Reader) (*http.Request, error) {
	bossToken, bossCookie, _, err := app.resolveBossAuth(ctx)
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(app.cfg.BossAPIHost, "/")+endpoint, body)
	if err != nil {
		return nil, err
	}

	request.Header.Set("Accept", "application/json, text/plain, */*")
	request.Header.Set("Origin", app.cfg.BossAPIHost)
	request.Header.Set("Referer", app.cfg.BossReferer)
	request.Header.Set("ovo-authorization", buildBossAuthorization(app.cfg, bossToken))
	request.Header.Set("Cookie", bossCookie)
	request.Header.Set("User-Agent", "inspection-api/1.0")

	return request, nil
}

func (m *bossSessionManager) EnsureValid(ctx context.Context) (*bossSessionSnapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now().UnixMilli()
	if m.state != nil {
		if m.state.RefreshTokenValidity > 0 && now >= m.state.RefreshTokenValidity {
			m.state = nil
		} else if m.state.Token != "" && now < m.state.TokenValidity-(5*60*1000) {
			return cloneBossSession(m.state), nil
		} else if m.state.Token != "" {
			if err := m.refresh(ctx); err == nil {
				return cloneBossSession(m.state), nil
			}
			m.state = nil
		}
	}

	if err := m.login(ctx); err != nil {
		return nil, err
	}
	return cloneBossSession(m.state), nil
}

func cloneBossSession(session *bossSessionSnapshot) *bossSessionSnapshot {
	if session == nil {
		return nil
	}
	clone := *session
	return &clone
}

func (m *bossSessionManager) login(ctx context.Context) error {
	payload := map[string]interface{}{
		"userName":       m.cfg.BossUsername,
		"password":       hashMD5(strings.TrimSpace(m.cfg.BossPassword)),
		"loginType":      1,
		"deviceSerialNo": m.cfg.BossDeviceID,
		"deviceName":     m.cfg.BossDeviceName,
		"nationalCode":   m.cfg.BossNationCode,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		strings.TrimRight(m.cfg.BossAuthHost, "/")+"/api/ovopark-privilege/user/login",
		strings.NewReader(string(body)),
	)
	if err != nil {
		return err
	}

	request.Header.Set("Accept", "application/json, text/plain, */*")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", strings.TrimRight(m.cfg.BossAuthHost, "/"))
	request.Header.Set("Referer", strings.TrimRight(m.cfg.BossAuthHost, "/")+"/login")
	request.Header.Set("User-Agent", "inspection-api/1.0")

	var result bossAuthResponse
	if err := m.doAuthRequest(request, &result); err != nil {
		return err
	}

	groupID := result.Data.GroupID
	if groupID == 0 {
		groupID = result.Data.EnterpriseID
	}
	m.state = &bossSessionSnapshot{
		Token:                result.Data.Token,
		TokenValidity:        result.Data.TokenExpirationTimestamp,
		RefreshTokenValidity: result.Data.RefreshExpirationTimestamp,
		GroupID:              strconv.FormatInt(groupID, 10),
		UserID:               strconv.FormatInt(result.Data.UserID, 10),
		UserName:             strings.TrimSpace(result.Data.UserName),
	}
	return nil
}

func (m *bossSessionManager) refresh(ctx context.Context) error {
	if m.state == nil || m.state.Token == "" {
		return errors.New("missing boss token")
	}

	refreshURL := strings.TrimRight(m.cfg.BossAuthHost, "/") + "/api/ovopark-privilege/user/reFreshToken?token=" + url.QueryEscape(m.state.Token)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, refreshURL, nil)
	if err != nil {
		return err
	}

	request.Header.Set("Accept", "application/json, text/plain, */*")
	request.Header.Set("Referer", strings.TrimRight(m.cfg.BossAuthHost, "/")+"/home/index.html")
	request.Header.Set("User-Agent", "inspection-api/1.0")

	var result bossAuthResponse
	if err := m.doAuthRequest(request, &result); err != nil {
		return err
	}

	groupID := result.Data.GroupID
	if groupID == 0 {
		parsedGroupID, _ := strconv.ParseInt(m.state.GroupID, 10, 64)
		groupID = parsedGroupID
	}
	m.state = &bossSessionSnapshot{
		Token:                result.Data.Token,
		TokenValidity:        result.Data.TokenExpirationTimestamp,
		RefreshTokenValidity: result.Data.RefreshExpirationTimestamp,
		GroupID:              strconv.FormatInt(groupID, 10),
		UserID:               strconv.FormatInt(result.Data.UserID, 10),
		UserName:             strings.TrimSpace(result.Data.UserName),
	}
	return nil
}

func (m *bossSessionManager) doAuthRequest(request *http.Request, result *bossAuthResponse) error {
	response, err := m.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return err
	}
	if response.StatusCode >= http.StatusBadRequest {
		return fmt.Errorf("boss auth request failed: %s", strings.TrimSpace(string(body)))
	}
	if err := json.Unmarshal(body, result); err != nil {
		return err
	}
	if result.IsError || result.Code != "0" || strings.TrimSpace(result.Data.Token) == "" {
		message := strings.TrimSpace(result.Message)
		if message == "" {
			message = "boss auth request failed"
		}
		return errors.New(message)
	}
	return nil
}

func (m *bossSessionManager) SetCredentials(username string, password string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.cfg.BossUsername = strings.TrimSpace(username)
	m.cfg.BossPassword = strings.TrimSpace(password)
	m.state = nil
}

func hashMD5(value string) string {
	sum := md5.Sum([]byte(value))
	return hex.EncodeToString(sum[:])
}

func (app *App) loginBossSession(ctx *gin.Context) {
	var payload bossLoginRequest
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}

	username := strings.TrimSpace(payload.Username)
	password := strings.TrimSpace(payload.Password)
	if username == "" || password == "" {
		fail(ctx, http.StatusBadRequest, "username and password are required")
		return
	}

	if app.bossSession == nil {
		cfg := app.cfg
		cfg.BossUsername = username
		cfg.BossPassword = password
		app.bossSession = mustNewBossSessionManager(cfg)
	}
	app.bossSession.SetCredentials(username, password)

	session, err := app.bossSession.EnsureValid(ctx.Request.Context())
	if err != nil {
		fail(ctx, http.StatusBadGateway, err.Error())
		return
	}

	raw, err := json.Marshal(gin.H{
		"groupId":              session.GroupID,
		"userId":               session.UserID,
		"userName":             session.UserName,
		"tokenValidity":        session.TokenValidity,
		"refreshTokenValidity": session.RefreshTokenValidity,
	})
	if err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}

	app.cfg.BossUsername = username
	app.cfg.BossPassword = password
	app.cfg.BossGroupID = session.GroupID

	success(ctx, openPlatformTokenResponse{
		Token:          session.Token,
		EnterpriseID:   session.GroupID,
		IdentifierType: "bossUsername",
		Identifier:     username,
		Raw:            raw,
	})
}

func (app *App) getBossDepartmentsTree(ctx *gin.Context) {
	bossToken, bossCookie, defaultGroupID, err := app.resolveBossAuth(ctx.Request.Context())
	if err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}

	var payload bossDepartmentTreeRequest
	if err := ctx.ShouldBindJSON(&payload); err != nil && err.Error() != "EOF" {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}

	groupID := strings.TrimSpace(payload.GroupID)
	if groupID == "" {
		groupID = defaultGroupID
	}
	if groupID == "" {
		fail(ctx, http.StatusBadRequest, "groupId is required")
		return
	}

	rootID := strings.TrimSpace(payload.ID)
	if rootID == "" {
		rootID = "G_" + groupID
	}

	requestPayload := map[string]interface{}{
		"groupId":        mustAtoi(groupID),
		"id":             rootID,
		"orderByTime":    boolOrDefault(payload.OrderByTime, false),
		"orderByAsc":     boolOrDefault(payload.OrderByAsc, true),
		"isAddDevNode":   intOrDefault(payload.IsAddDevNode, 1),
		"showType":       intOrDefault(payload.ShowType, 5),
		"isQueryAll":     intOrDefault(payload.IsQueryAll, 1),
		"moduleId":       intOrDefault(payload.ModuleID, 2),
		"showClosedShop": boolOrDefault(payload.ShowClosedShop, true),
		"showShopCount":  boolOrDefault(payload.ShowShopCount, true),
	}

	bodyBytes, err := json.Marshal(requestPayload)
	if err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}

	request, err := http.NewRequestWithContext(
		ctx.Request.Context(),
		http.MethodPost,
		strings.TrimRight(app.cfg.BossAPIHost, "/")+"/ovopark-organize/treeNode/getSimpleDepartmentsTree",
		strings.NewReader(string(bodyBytes)),
	)
	if err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}

	request.Header.Set("Accept", "application/json, text/plain, */*")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", app.cfg.BossAPIHost)
	request.Header.Set("Referer", app.cfg.BossReferer)
	request.Header.Set("ovo-authorization", buildBossAuthorization(app.cfg, bossToken))
	request.Header.Set("Cookie", bossCookie)
	request.Header.Set("User-Agent", ctx.GetHeader("User-Agent"))

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		fail(ctx, http.StatusBadGateway, err.Error())
		return
	}
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		fail(ctx, http.StatusBadGateway, err.Error())
		return
	}
	if response.StatusCode >= http.StatusBadRequest {
		fail(ctx, http.StatusBadGateway, string(body))
		return
	}

	var result bossDepartmentTreeResponse
	if err := json.Unmarshal(body, &result); err != nil {
		fail(ctx, http.StatusBadGateway, err.Error())
		return
	}
	if result.IsError {
		fail(ctx, http.StatusBadGateway, "boss department tree returned error")
		return
	}

	success(ctx, result.Data)
}

func (app *App) getBossDeptDevices(ctx *gin.Context) {
	bossToken, bossCookie, defaultGroupID, err := app.resolveBossAuth(ctx.Request.Context())
	if err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}

	var payload bossDeptDeviceListRequest
	if err := ctx.ShouldBindQuery(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}

	groupID := strings.TrimSpace(payload.GroupID)
	if groupID == "" {
		groupID = defaultGroupID
	}
	if groupID == "" {
		fail(ctx, http.StatusBadRequest, "groupId is required")
		return
	}

	rootID := strings.TrimSpace(payload.ID)
	deptID := strings.TrimSpace(payload.DeptID)
	if rootID == "" && deptID == "" {
		fail(ctx, http.StatusBadRequest, "id or deptId is required")
		return
	}
	if deptID == "" && strings.HasPrefix(rootID, "S_") {
		deptID = strings.TrimPrefix(rootID, "S_")
	}
	if rootID == "" && deptID != "" {
		rootID = "S_" + deptID
	}
	if deptID == "" {
		fail(ctx, http.StatusBadRequest, "deptId is required")
		return
	}

	queryValues := url.Values{}
	queryValues.Set("groupId", groupID)
	queryValues.Set("id", rootID)
	queryValues.Set("deptId", deptID)
	queryValues.Set("orderByTime", strconv.FormatBool(boolOrDefault(payload.OrderByTime, false)))
	queryValues.Set("orderByAsc", strconv.FormatBool(boolOrDefault(payload.OrderByAsc, true)))
	queryValues.Set("isAddDevNode", strconv.Itoa(intOrDefault(payload.IsAddDevNode, 1)))
	queryValues.Set("showType", strconv.Itoa(intOrDefault(payload.ShowType, 5)))
	queryValues.Set("isQueryAll", strconv.Itoa(intOrDefault(payload.IsQueryAll, 1)))
	queryValues.Set("moduleId", strconv.Itoa(intOrDefault(payload.ModuleID, 2)))
	queryValues.Set("showClosedShop", strconv.FormatBool(boolOrDefault(payload.ShowClosedShop, true)))
	queryValues.Set("showShopCount", strconv.FormatBool(boolOrDefault(payload.ShowShopCount, true)))

	requestURL := strings.TrimRight(app.cfg.BossAPIHost, "/") + "/ovopark-device/device-new/deptDeviceList?" + queryValues.Encode()
	request, err := http.NewRequestWithContext(ctx.Request.Context(), http.MethodGet, requestURL, nil)
	if err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}

	request.Header.Set("Accept", "application/json, text/plain, */*")
	request.Header.Set("Origin", app.cfg.BossAPIHost)
	request.Header.Set("Referer", app.cfg.BossReferer)
	request.Header.Set("ovo-authorization", buildBossAuthorization(app.cfg, bossToken))
	request.Header.Set("Cookie", bossCookie)
	request.Header.Set("User-Agent", ctx.GetHeader("User-Agent"))

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		fail(ctx, http.StatusBadGateway, err.Error())
		return
	}
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		fail(ctx, http.StatusBadGateway, err.Error())
		return
	}
	if response.StatusCode >= http.StatusBadRequest {
		fail(ctx, http.StatusBadGateway, string(body))
		return
	}

	var result bossDeviceListResponse
	if err := json.Unmarshal(body, &result); err != nil {
		fail(ctx, http.StatusBadGateway, err.Error())
		return
	}
	if result.IsError {
		message := strings.TrimSpace(result.Message)
		if message == "" {
			message = "boss device list returned error"
		}
		fail(ctx, http.StatusBadGateway, message)
		return
	}

	success(ctx, result.Data)
}

func (app *App) startBossVideoPlay(ctx *gin.Context) {
	var payload bossVideoPlayRequest
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}

	if payload.DeviceID == 0 {
		fail(ctx, http.StatusBadRequest, "deviceId is required")
		return
	}
	if payload.RealPlayType == 0 {
		payload.RealPlayType = 1
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}

	request, err := app.newBossRequest(ctx.Request.Context(), http.MethodPost, "/ovopark-device/video/startNewMediaPlay", strings.NewReader(string(bodyBytes)))
	if err != nil {
		fail(ctx, http.StatusBadRequest, err.Error())
		return
	}
	request.Header.Set("Content-Type", "application/json;charset=UTF-8")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		fail(ctx, http.StatusBadGateway, err.Error())
		return
	}
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		fail(ctx, http.StatusBadGateway, err.Error())
		return
	}
	if response.StatusCode >= http.StatusBadRequest {
		fail(ctx, http.StatusBadGateway, string(body))
		return
	}

	var result bossVideoPlayResponse
	if err := json.Unmarshal(body, &result); err != nil {
		fail(ctx, http.StatusBadGateway, err.Error())
		return
	}
	if result.IsError || strings.TrimSpace(result.Code) != "0" {
		message := strings.TrimSpace(result.Message)
		if message == "" {
			message = "boss video play returned error"
		}
		fail(ctx, http.StatusBadGateway, message)
		return
	}

	streamSource := strings.TrimSpace(result.Data.TLSFlv)
	if streamSource == "" {
		streamSource = strings.TrimSpace(result.Data.Flv)
	}
	if streamSource == "" {
		streamSource = strings.TrimSpace(result.Data.URL)
	}
	if streamSource == "" {
		fail(ctx, http.StatusBadGateway, "boss video play returned empty stream")
		return
	}

	proxyStreamURL := "/inspection-api/api/boss/video/stream?source=" + url.QueryEscape(streamSource)
	hlsURL := strings.TrimSpace(result.Data.TLSHls)
	if hlsURL != "" {
		hlsURL = "/inspection-api/api/boss/video/stream?source=" + url.QueryEscape(hlsURL)
	}

	success(ctx, bossVideoSessionResponse{
		DeviceID:          result.Data.DeviceID,
		Name:              result.Data.Name,
		StreamURL:         proxyStreamURL,
		HlsURL:            hlsURL,
		SessionID:         result.Data.SessionID,
		NetworkQualityURL: result.Data.NetworkQualityURL,
		Raw:               json.RawMessage(body),
	})
}

func (app *App) proxyBossVideoStream(ctx *gin.Context) {
	source := strings.TrimSpace(ctx.Query("source"))
	if source == "" {
		fail(ctx, http.StatusBadRequest, "source is required")
		return
	}

	parsed, err := url.Parse(source)
	if err != nil {
		fail(ctx, http.StatusBadRequest, "invalid source")
		return
	}

	host := strings.ToLower(parsed.Hostname())
	if host == "" || !strings.HasSuffix(host, ".ovopark.com") {
		fail(ctx, http.StatusBadRequest, "source host is not allowed")
		return
	}

	request, err := http.NewRequestWithContext(ctx.Request.Context(), http.MethodGet, source, nil)
	if err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	request.Header.Set("User-Agent", "inspection-api/1.0")

	streamClient := &http.Client{
		Timeout: 0,
	}
	response, err := streamClient.Do(request)
	if err != nil {
		fail(ctx, http.StatusBadGateway, err.Error())
		return
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		fail(ctx, http.StatusBadGateway, strings.TrimSpace(string(body)))
		return
	}

	if contentType := response.Header.Get("Content-Type"); contentType != "" {
		ctx.Header("Content-Type", contentType)
	} else if strings.HasSuffix(strings.ToLower(parsed.Path), ".m3u8") {
		ctx.Header("Content-Type", "application/vnd.apple.mpegurl")
	} else {
		ctx.Header("Content-Type", "video/x-flv")
	}
	ctx.Header("Cache-Control", "no-store")
	ctx.Status(response.StatusCode)

	if _, err := io.Copy(ctx.Writer, response.Body); err != nil {
		ctx.Error(err)
	}
}

func boolOrDefault(value *bool, fallback bool) bool {
	if value == nil {
		return fallback
	}
	return *value
}

func intOrDefault(value *int, fallback int) int {
	if value == nil {
		return fallback
	}
	return *value
}

func mustAtoi(value string) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return 0
	}
	return parsed
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
		"name":                  payload.Name,
		"code":                  payload.Code,
		"alias_list":            payload.AliasList,
		"region":                payload.Region,
		"status":                payload.Status,
		"manager_name":          payload.ManagerName,
		"manager_wecom_user_id": payload.ManagerWecomUserID,
		"remark":                payload.Remark,
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
		"store_id":            payload.StoreID,
		"name":                payload.Name,
		"alias_list":          payload.AliasList,
		"stream_url":          payload.StreamURL,
		"stream_type":         payload.StreamType,
		"source_alias":        payload.SourceAlias,
		"baseline_image_url":  payload.BaselineImageURL,
		"baseline_image_path": payload.BaselineImagePath,
		"enabled":             payload.Enabled,
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
		"name":                         payload.Name,
		"code":                         payload.Code,
		"alias_list":                   payload.AliasList,
		"trigger_keywords":             payload.TriggerKeywords,
		"plan_type":                    payload.PlanType,
		"description":                  payload.Description,
		"frame_pick_mode":              payload.FramePickMode,
		"match_threshold_percent":      payload.MatchThresholdPercent,
		"difference_threshold_percent": payload.DifferenceThresholdPercent,
		"enabled":                      payload.Enabled,
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
		"item_type":  payload.ItemType,
		"content":    payload.Content,
		"sort_order": payload.SortOrder,
		"required":   payload.Required,
		"enabled":    payload.Enabled,
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
		"store_id":                            payload.StoreID,
		"plan_id":                             payload.PlanID,
		"stream_id":                           payload.StreamID,
		"custom_match_threshold_percent":      payload.CustomMatchThresholdPercent,
		"custom_difference_threshold_percent": payload.CustomDifferenceThresholdPercent,
		"enabled":                             payload.Enabled,
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
		"store_id":    payload.StoreID,
		"plan_id":     payload.PlanID,
		"cron_expr":   payload.CronExpr,
		"enabled":     payload.Enabled,
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
		"store":     store,
		"stream":    stream,
		"plan":      plan,
		"items":     items,
		"binding":   binding,
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
		StoreID:   req.StoreID,
		StoreName: req.StoreName,
		PlanID:    req.PlanID,
		PlanName:  req.PlanName,
		Source:    req.Source,
	})
	if err != nil {
		fail(ctx, http.StatusNotFound, err.Error())
		return
	}
	now := time.Now()
	job := InspectionJob{
		JobNo:               fmt.Sprintf("JOB-%s-%04d", now.Format("20060102150405"), time.Now().Nanosecond()%10000),
		StoreID:             store.ID,
		PlanID:              plan.ID,
		BindingID:           binding.ID,
		TriggerType:         valueOr(req.TriggerType, "manual"),
		TriggerSource:       req.TriggerSource,
		OperatorName:        req.OperatorName,
		OperatorWecomUserID: req.OperatorWecomUserID,
		Status:              "pending",
	}
	if err := app.db.Create(&job).Error; err != nil {
		fail(ctx, http.StatusInternalServerError, err.Error())
		return
	}
	success(ctx, gin.H{
		"job":       job,
		"store":     store,
		"stream":    stream,
		"plan":      plan,
		"items":     items,
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
			"status":        job.Status,
			"finished_at":   now,
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

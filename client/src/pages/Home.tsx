import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Streamdown } from "streamdown";

// 卡片内容加载动画组件
function CardLoadingIndicator() {
  return (
    <div className="flex items-center justify-center py-2">
      <Loader2 className="h-4 w-4 animate-spin text-gray-400 mr-2" />
      <span className="text-sm text-gray-400">正在加载你的专属指引...</span>
    </div>
  );
}

interface CoinAnalysis {
  greeting?: string;
  outfit?: string;
  color?: string;
  mood?: string;
  career?: string;
  love?: string;
  luck?: string;
}

interface AnalysisResult {
  id: number;
  coinResults: number[];
  analysis: CoinAnalysis;
  isCached: boolean;
}

// 字段名称列表，用于并行请求
const FIELD_NAMES = ["greeting", "outfit", "color", "mood", "career", "love", "luck"] as const;

/**
 * 生成设备指纹
 * 优先从 localStorage 获取，如果没有则生成一个随机 UUID 并存储
 * 这样可以避免安卓 WebView 环境下硬件信息一致导致的指纹冲突
 */
function getDeviceFingerprint(): string {
  const STORAGE_KEY = 'coin_fortune_device_id';
  
  // 尝试从本地存储获取
  let fingerprint = localStorage.getItem(STORAGE_KEY);
  
  if (!fingerprint) {
    // 生成新的唯一标识 (UUID v4 风格的随机字符串)
    fingerprint = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    
    // 存储到本地
    localStorage.setItem(STORAGE_KEY, fingerprint);
  }
  
  return fingerprint;
}

// 8列 × 6行 = 48个标签，按列纵向排列
const QUESTIONS = [
  // 第一列
  "今天的天气适合出门吗？",
  "今天的穿搭打几分？",
  "今天中午吃什么？",
  "要不要喝奶茶？",
  "今晚吃啥？",
  "下班后去哪儿放松？",
  // 第二列
  "他喜欢我吗？",
  "对方是不是在敷衍我？",
  "要不要给他发消息？",
  "不回消息是生气了吗？",
  "是不是我太敏感了？",
  "求表扬",
  // 第三列
  "好像没人懂我",
  "今天适合发疯吗？",
  "想哭但又没理由怎么办？",
  "我在焦虑什么？",
  "请夸我",
  "情绪低落是为什么？",
  // 第四列
  "该不该换新手机？",
  "要不要现在下单？",
  "买这件东西是冲动消费吗？",
  "这个东西值不值？",
  "要不要报那个培训班？",
  "钱不够花怎么办？",
  // 第五列
  "我说的这句话是不是太冒失了？",
  "要不要改昵称？",
  "要不要换头像？",
  "要不要发这条朋友圈？",
  "要不要参加这次聚会？",
  "如何快速调整低落的情绪？",
  // 第六列
  "今天该做点什么？",
  "给个提升自我的小任务",
  "今天去哪玩？",
  "为什么最近总是很累？",
  "想听点好消息",
  "睡不着怎么办？",
  // 第七列
  "感觉灵感枯竭怎么办？",
  "我是不是该换工作了？",
  "我是不是又搞砸了？",
  "同事对我有意见吗？",
  "如何应对突如其来的压力？",
  "如何平衡工作和生活？",
  // 第八列
  "情侣适合去哪约会？",
  "要约会该穿什么？",
  "一个人去旅行安全吗？",
  "适合独处的好去处？",
  "如何找到适合自己的放松方式？",
  "推荐一件提升幸福感的小事"
];

// 使用次数限制提示语
const LIMIT_MESSAGES_DAYTIME = [
  "今天的智慧已耗尽，明天再继续为你出谋划策～",
  "小脑瓜冒烟啦！明天再来帮你想主意吧～",
  "今天的小困惑已经努力回答完啦，请明天再来呀～",
  "哎呀，小指南针今天转累了，明天再陪你找方向～",
  "问题超限，再问就要剧透宇宙奥秘了～明天继续哦！"
];

const LIMIT_MESSAGES_NIGHT = [
  "问题就先放一放，夜里睡个好觉，明天再一起想办法～",
  "你今天已经很努力啦，明天再继续帮你出主意，好不好～",
  "留一点小困惑给明天，就像留一点梦给星星～",
  "问题不是今天一定要解完的事，明天继续一起解锁生活～"
];

function getRandomLimitMessage(): string {
  const now = new Date();
  const hour = now.getHours();
  
  // 20:00-24:00使用夜间提示语
  if (hour >= 20) {
    return LIMIT_MESSAGES_NIGHT[Math.floor(Math.random() * LIMIT_MESSAGES_NIGHT.length)];
  } else {
    return LIMIT_MESSAGES_DAYTIME[Math.floor(Math.random() * LIMIT_MESSAGES_DAYTIME.length)];
  }
}

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [deviceFingerprint, setDeviceFingerprint] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState<string>("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<string>("");
  const [isExplanationLoading, setIsExplanationLoading] = useState(false);
  // 启动动画：控制元素逐个显示
  const [visibleElements, setVisibleElements] = useState<Set<string>>(new Set());

  // 获取今日基础数据（硬币结果和已缓存的字段）
  const getTodayQuery = trpc.coin.getToday.useQuery(
    { deviceFingerprint },
    { enabled: !!deviceFingerprint }
  );

  // 使用 trpc 的 useUtils 来手动调用 getField
  const trpcUtils = trpc.useUtils();

  const explainQuestionMutation = trpc.coin.explainQuestion.useMutation();
  
  // 获取热门标签
  const hotQuestionsQuery = trpc.hotQuestions.getToday.useQuery();

  // 初始化设备指纹和获取今日运势
  useEffect(() => {
    // 立即更新日期显示，优先渲染界面
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekday = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
    const dateString = `${year}年${month}月${day}日 (周${weekday})`;
    setCurrentDate(dateString);

    // 延迟100ms生成设备指纹和查询运势，让浏览器优先渲染顶部界面
    setTimeout(() => {
      const fingerprint = getDeviceFingerprint();
      setDeviceFingerprint(fingerprint);
    }, 100);
  }, []);

  // 使用 ref 记录已经开始加载的字段，避免重复请求
  const loadingFieldsRef = useRef<Set<string>>(new Set());
  
  // 当基础查询完成时，设置基础数据并请求缺失字段
  useEffect(() => {
    if (getTodayQuery.data) {
      const baseData = getTodayQuery.data;
      const existingAnalysis = baseData.analysis as CoinAnalysis || {};
      
      // 设置基础结果
      setResult((prev) => {
        // 如果已有数据且 ID 相同，合并已加载的字段
        if (prev && prev.id === baseData.id) {
          return {
            ...prev,
            analysis: {
              ...existingAnalysis,
              ...prev.analysis,
            },
          };
        }
        // 新数据，重置加载状态
        loadingFieldsRef.current = new Set();
        return {
          id: baseData.id,
          coinResults: baseData.coinResults,
          analysis: existingAnalysis,
          isCached: baseData.isCached,
        };
      });
      setIsLoading(false);
      setError(null);

      // 并行请求所有缺失的字段
      if (deviceFingerprint) {
        FIELD_NAMES.forEach(async (fieldName) => {
          // 如果字段已存在（缓存）或正在加载，跳过
          if (existingAnalysis[fieldName] || loadingFieldsRef.current.has(fieldName)) {
            return;
          }

          // 标记为正在加载
          loadingFieldsRef.current.add(fieldName);

          try {
            const fieldData = await trpcUtils.coin.getField.fetch({
              deviceFingerprint,
              fieldName,
            });

            // 更新 result 中的对应字段
            setResult((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                analysis: {
                  ...prev.analysis,
                  [fieldName]: fieldData.value,
                },
              };
            });
          } catch (err) {
            console.error(`Failed to fetch field ${fieldName}:`, err);
            // 加载失败时移除标记，允许重试
            loadingFieldsRef.current.delete(fieldName);
          }
        });
      }
    } else if (getTodayQuery.isLoading) {
      setIsLoading(true);
    } else if (getTodayQuery.error) {
      setIsLoading(false);
      setError('加载失败，请刷新页面重试');
    }
  }, [getTodayQuery.data, getTodayQuery.isLoading, getTodayQuery.error, deviceFingerprint, trpcUtils]);

  // 初始化轮播和下拉菜单
  useEffect(() => {
    if (!result) return;

    // 启动轮播
    const carouselText = document.getElementById('carousel-text');
    if (carouselText) {
      carouselText.textContent = QUESTIONS[currentQuestionIndex];
      carouselText.style.animation = 'fadeIn 0.5s forwards';
    }

    const carouselInterval = setInterval(() => {
      setCurrentQuestionIndex((prev) => (prev + 1) % QUESTIONS.length);
    }, 3000);

    // 设置下拉菜单
    const titleBar = document.getElementById('question-title-bar');
    const dropdownContent = document.getElementById('dropdown-content');
    const tagsContainer = document.getElementById('question-tags-container');

    if (titleBar && dropdownContent && tagsContainer) {
      // 清空之前的标签
      tagsContainer.innerHTML = '';

      // 获取热门标签列表
      const hotQuestions = hotQuestionsQuery.data?.hotQuestions || [];
      
      // 重新排列标签：从按列排列改为按行排列
      // 原来：8列6行，按列排列（1-6是第一列，7-12是第二列...）
      // 现在：每行8个，按行排列（1,7,13,19,25,31,37,43是第一行，2,8,14,20,26,32,38,44是第二行...）
      const COLUMNS = 8;
      const ROWS = 6;
      const reorderedQuestions: Array<{question: string, originalIndex: number}> = [];
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLUMNS; col++) {
          // 原索引：列号 * 行数 + 行号
          const originalIndex = col * ROWS + row;
          if (originalIndex < QUESTIONS.length) {
            reorderedQuestions.push({
              question: QUESTIONS[originalIndex],
              originalIndex: originalIndex
            });
          }
        }
      }
      
      // 添加新标签（使用重新排列后的顺序）
      reorderedQuestions.forEach((item, displayIndex) => {
        const tag = document.createElement('span');
        tag.className = 'question-tag';
        tag.style.cursor = 'pointer';
        tag.style.position = 'relative'; // 为徽章定位做准备
        // 强制应用背景色和边框（兼容安卓浏览器）
        // 配色基于总标签索引（0-47），实现错落有致的分布，避免按列对齐
        // 使用总标签索引（displayIndex）确保颜色在整个48个标签中按顺序循环：1,2,3,4,5,1,2,3,4,5...
        // 使用5种颜色（不是8的因数）可以更好地实现错落分布
        const totalIndex = displayIndex; // 标签在 0 到 47 之间的绝对索引
        const colorIndex = totalIndex % 5; // 颜色索引：0, 1, 2, 3, 4 循环
        
        // 调试信息：前10个标签打印颜色索引
        if (displayIndex < 10) {
          console.log(`标签 ${displayIndex}: totalIndex=${totalIndex}, colorIndex=${colorIndex}`);
        }
        if (colorIndex === 0) {
          // 颜色1：粉色
          tag.style.backgroundColor = '#ffeaea';
          tag.style.color = '#d66';
          tag.style.border = '1px solid #ffcccc';
        } else if (colorIndex === 1) {
          // 颜色2：蓝色
          tag.style.backgroundColor = '#eaf3ff';
          tag.style.color = '#72a5ff';
          tag.style.border = '1px solid #cce0ff';
        } else if (colorIndex === 2) {
          // 颜色3：绿色
          tag.style.backgroundColor = '#e8fff0';
          tag.style.color = '#4db6ac';
          tag.style.border = '1px solid #c0f5d4';
        } else if (colorIndex === 3) {
          // 颜色4：黄色
          tag.style.backgroundColor = '#fffbe9';
          tag.style.color = '#ffc107';
          tag.style.border = '1px solid #ffe6aa';
        } else if (colorIndex === 4) {
          // 颜色5：紫色（增强对比度，确保可见）
          tag.style.backgroundColor = '#f3e5f5';
          tag.style.color = '#7b1fa2';
          tag.style.border = '1px solid #ce93d8';
          // 强制应用样式，确保不被覆盖
          tag.setAttribute('data-color-index', '4');
        } else {
          // 兜底：如果出现意外情况，使用粉色
          tag.style.backgroundColor = '#ffeaea';
          tag.style.color = '#d66';
          tag.style.border = '1px solid #ffcccc';
        }
        
        // 如果是热门标签，添加火焰徽章
        if (hotQuestions.includes(item.question)) {
          const badge = document.createElement('span');
          badge.textContent = '🔥';
          badge.style.position = 'absolute';
          badge.style.top = '-8px';
          badge.style.right = '-8px';
          badge.style.fontSize = '16px';
          badge.style.zIndex = '10';
          tag.appendChild(badge);
        }
        
        // 添加标签文字 - 确保文字横向显示
        const textNode = document.createTextNode(item.question);
        tag.appendChild(textNode);
        // 强制设置标签样式，确保文字横向且不溢出
        tag.style.width = 'fit-content';
        tag.style.minWidth = 'fit-content';
        tag.style.maxWidth = 'fit-content';
        tag.style.minHeight = '38px';
        tag.style.maxHeight = '38px';
        tag.style.height = '38px';
        tag.style.padding = '6px 14px';
        tag.style.textAlign = 'center';
        tag.style.display = 'inline-flex';
        tag.style.alignItems = 'center';
        tag.style.justifyContent = 'center';
        tag.style.whiteSpace = 'nowrap';
        tag.style.overflow = 'visible';
        tag.style.textOverflow = 'clip';
        tag.style.borderRadius = '20px';
        tag.style.flexShrink = '0';
        tag.style.margin = '0';

        tag.addEventListener('click', () => {
          console.log('点击了问题:', item.question);
          setSelectedQuestion(item.question);
          setExplanation(null);
          setIsExplanationLoading(true);
          explainQuestionMutation.mutate(
            { question: item.question, deviceFingerprint },
            {
              onSuccess: (data: any) => {
                console.log('获取到解读:', data);
                setIsExplanationLoading(false);
                if (data?.limitExceeded) {
                  setExplanation(data.message);
                } else if (data?.explanation) {
                  const explanationText = typeof data.explanation === 'string' ? data.explanation : JSON.stringify(data.explanation);
                  setExplanation(explanationText);
                } else if (data?.limitExceeded) {
                  setExplanation(getRandomLimitMessage());
                } else {
                  setExplanation('无法获取解读');
                }
              },
              onError: (error: any) => {
                console.error('获取解读失败:', error);
                setIsExplanationLoading(false);
                setExplanation('获取解读失败，请稍后再试');
              }
            }
          );
        });

        tagsContainer.appendChild(tag);
      });

      // 设置标题栏点击事件
      const handleTitleBarClick = () => {
        const isOpen = dropdownContent.classList.contains('open');
        dropdownContent.classList.toggle('open');
        titleBar.classList.toggle('active');
        
        // 如果是收起操作（之前是open，现在要关闭），清空回答框
        if (isOpen) {
          setExplanation(null);
          setIsExplanationLoading(false);
          setSelectedQuestion('');
        }
      };
      titleBar.addEventListener('click', handleTitleBarClick);

      // 清理函数：移除事件监听器
      return () => {
        clearInterval(carouselInterval);
        titleBar.removeEventListener('click', handleTitleBarClick);
      };
    }

    return () => {
      clearInterval(carouselInterval);
    };
  }, [result, explainQuestionMutation, hotQuestionsQuery.data]);

  // 检测安卓浏览器并添加类名
  useEffect(() => {
    if (typeof window !== 'undefined' && window.navigator.userAgent.match(/Android/i)) {
      document.body.classList.add('android-browser');
    } else {
      document.body.classList.add('ios-browser');
    }
  }, []);

  // 启动动画：逐个显示元素
  useEffect(() => {
    // 立即显示静态内容（不依赖 result）
    setVisibleElements(new Set(['top-navigation', 'date-section', 'question-section']));
    
    if (result) {
      // 定义内容卡片的显示顺序和延迟时间（毫秒）
      const elements = [
        { id: 'greeting-card', delay: 200 },
        { id: 'outfit-card', delay: 400 },
        { id: 'color-card', delay: 600 },
        { id: 'mood-card', delay: 800 },
        { id: 'career-card', delay: 1000 },
        { id: 'love-card', delay: 1200 },
        { id: 'luck-card', delay: 1400 },
      ];

      // 逐个显示内容卡片
      elements.forEach(({ id, delay }) => {
        setTimeout(() => {
          setVisibleElements(prev => new Set(prev).add(id));
        }, delay);
      });
    }
  }, [result]);

  // 更新轮播文本
  useEffect(() => {
    const carouselText = document.getElementById('carousel-text');
    if (carouselText && result) {
      carouselText.style.animation = 'fadeOut 0.3s forwards';
      setTimeout(() => {
        carouselText.textContent = QUESTIONS[currentQuestionIndex];
        carouselText.style.animation = 'fadeIn 0.5s forwards';
      }, 300);
    }
  }, [currentQuestionIndex, result]);

  // 渐进式渲染：始终显示页面框架，用骨架屏替代等待内容
  // 不再使用全屏加载动画，而是立即显示静态内容和骨架屏
  
  // 骨架屏卡片组件（带加载动画）
  const CardSkeleton = ({ className = "" }: { className?: string }) => (
    <div className={`card-interactive rounded-2xl border-l-4 ${className}`} style={{
      borderLeftColor: '#e5e7eb',
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      backgroundColor: '#ffffff',
      background: '#ffffff',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      WebkitBoxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
      padding: '12px 16px',
      marginBottom: '16px',
      marginTop: '0',
      position: 'relative',
      overflow: 'hidden',
      minHeight: '120px'
    }}>
      {/* 中央加载动画 - 大号旋转图标 */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        minHeight: '100px',
        position: 'relative',
        zIndex: 2
      }}>
        {/* 大号旋转加载图标 */}
        <div 
          className="skeleton-loader"
          style={{
            width: '48px',
            height: '48px',
            border: '5px solid #fbcfe8',
            borderTopColor: '#ec4899',
            borderRightColor: '#ec4899',
            borderRadius: '50%',
            marginBottom: '12px',
            display: 'block'
          }}
        ></div>
        {/* 加载文字提示 */}
        <div style={{
          color: '#ec4899',
          fontSize: '14px',
          fontWeight: '500',
          animation: 'pulse 2s ease-in-out infinite',
          WebkitAnimation: 'pulse 2s ease-in-out infinite'
        }}>
          加载中...
        </div>
      </div>
      
      {/* 背景闪烁效果（可选，如果太花哨可以去掉） */}
      <div 
        className="skeleton-shimmer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '50%',
          height: '100%',
          background: 'linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(251, 207, 232, 0.3) 50%, rgba(255, 255, 255, 0) 100%)',
          zIndex: 0,
          pointerEvents: 'none',
          willChange: 'transform'
        }}
      ></div>
    </div>
  );

    return (
      <div className="min-h-screen py-6 sm:py-8" style={{
        background: '#fff7ed',
        backgroundImage: '-webkit-linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%), -moz-linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%), -o-linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%), linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%)',
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'scroll',
        minHeight: '100vh'
      }}>
        <div className="max-w-4xl mx-auto" style={{
          paddingLeft: '16px',
          paddingRight: '16px',
          paddingTop: '24px',
          paddingBottom: '24px',
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: '100%'
        }}>
          {/* 顶部导航按钮 - 立即显示 */}
          <div 
            id="top-navigation"
            style={{
              opacity: visibleElements.has('top-navigation') ? 1 : 1,
              transform: visibleElements.has('top-navigation') ? 'translateY(0)' : 'translateY(0)',
              transition: 'opacity 0.6s ease-out, transform 0.6s ease-out'
            }}
          >
            <a href="https://sleep.health-sleep.com/" target="_blank" rel="noopener noreferrer" className="nav-button" id="sleep-button">
              <span className="material-icons">bedtime</span>开始助眠
            </a>
            <a href="https://goodnight-etwfsck7.manus.space" target="_blank" rel="noopener noreferrer" className="nav-button" id="goodnight-button">
              <span className="material-icons">dark_mode</span>说晚安
            </a>
          </div>

          {/* 顶部 - 立即显示 */}
          <div 
            id="date-section"
            className="text-left mb-8 sm:mb-12"
            style={{
              opacity: visibleElements.has('date-section') ? 1 : 1,
              transform: visibleElements.has('date-section') ? 'translateY(0)' : 'translateY(0)',
              transition: 'opacity 0.6s ease-out, transform 0.6s ease-out'
            }}
          >
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-pink-600 mb-2 date-title">
              {currentDate}
            </h1>
            <p className="text-gray-600 text-base sm:text-lg">
              你的今日专属指引
            </p>
          </div>

          {/* 解答小困惑功能 - 立即显示 */}
          <div 
            id="question-section" 
            className="mb-8 sm:mb-10"
            style={{
              opacity: visibleElements.has('question-section') ? 1 : 1,
              transform: visibleElements.has('question-section') ? 'translateY(0)' : 'translateY(0)',
              transition: 'opacity 0.6s ease-out, transform 0.6s ease-out'
            }}
          >
            <div id="question-title-bar" style={{marginTop: '-21px', marginBottom: '15px', userSelect: 'none'}}>
              <div id="question-label">
                <span className="material-icons">lightbulb</span>解答小困惑
              </div>
              <div id="carousel-text-container">
                <span id="carousel-text"></span>
              </div>
              <span className="material-icons" id="dropdown-arrow">expand_more</span>
            </div>
            <div id="dropdown-content" style={{paddingTop: '0px', paddingRight: '0px', paddingLeft: '0px', overflowX: 'hidden', overflowY: 'hidden'}}>
              <div id="question-tags-container" style={{
                padding: '12px',
                paddingLeft: '16px',
                width: '100%',
                boxSizing: 'border-box',
                overflowX: 'auto',
                overflowY: 'hidden',
                WebkitOverflowScrolling: 'touch',
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: 'repeat(8, minmax(min-content, max-content))',
                gap: '6px 12px'
              }}></div>
            </div>
            {(explanation || isExplanationLoading) && (
              <>
                {explanation && (LIMIT_MESSAGES_DAYTIME.includes(explanation) || LIMIT_MESSAGES_NIGHT.includes(explanation)) ? (
                  <div className="mt-6 mb-8 p-6 sm:p-8 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl border-2 border-purple-300 text-center">
                    <div className="mb-4">
                      <span className="text-4xl">✨</span>
                    </div>
                    <p className="text-lg sm:text-xl font-semibold text-purple-700 leading-relaxed">
                      {explanation}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 p-4 rounded-lg border-l-4" style={{
                    borderLeftColor: '#4eb7a2',
                    marginBottom: '16px',
                    marginTop: '0px',
                    backgroundColor: '#ffffff',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    WebkitBoxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                  }}>
                    <h3 className="font-semibold text-base sm:text-lg mb-3" style={{color: '#4eb7a2'}}>
                      {selectedQuestion}
                    </h3>
                    {isExplanationLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-[#4eb7a2] rounded-full animate-spin"></div>
                        <span className="text-sm sm:text-base text-gray-600">正在为你生成解读...</span>
                      </div>
                    ) : (
                      <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                        {explanation}
                      </Streamdown>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 加载动画 - 显示在解答小困惑和卡片之间 */}
          {!result && getTodayQuery.isLoading && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px',
              marginBottom: '32px'
            }}>
              {/* 大号旋转加载图标 */}
              <div 
                className="skeleton-loader"
                style={{
                  width: '64px',
                  height: '64px',
                  border: '6px solid #fbcfe8',
                  borderTopColor: '#ec4899',
                  borderRightColor: '#ec4899',
                  borderRadius: '50%',
                  marginBottom: '16px',
                  display: 'block'
                }}
              ></div>
              {/* 加载文字提示 */}
              <div style={{
                color: '#ec4899',
                fontSize: '16px',
                fontWeight: '500',
                animation: 'pulse 2s ease-in-out infinite',
                WebkitAnimation: 'pulse 2s ease-in-out infinite'
              }}>
                正在加载你的专属指引...
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="mb-8 p-4 bg-red-50 border-l-4 border-red-400 rounded">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {/* 运势分析结果 - 按原始HTML的布局 */}
          <div className="grid grid-cols-1 md:grid-cols-3" style={{
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            paddingLeft: '0',
            paddingRight: '0',
            gap: '16px',
            rowGap: '16px',
            columnGap: '16px',
            marginBottom: '32px',
            marginTop: '0'
          }}>
            {/* 早安心语 - 跨越全宽 */}
            <div 
              className="md:col-span-3"
              style={{
                opacity: visibleElements.has('greeting-card') ? 1 : 0,
                transform: visibleElements.has('greeting-card') ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.6s ease-out, transform 0.6s ease-out'
              }}
            >
              <div className="card-interactive rounded-2xl border-l-4" style={{
                borderLeftColor: '#ff9999',
                borderLeftWidth: '4px',
                borderLeftStyle: 'solid',
                backgroundColor: '#ffffff',
                background: '#ffffff',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                WebkitBoxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                padding: '12px 16px',
                paddingTop: '12px',
                paddingBottom: '12px',
                paddingLeft: '16px',
                paddingRight: '16px',
                marginBottom: '16px',
                marginTop: '0'
              }}>
                <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center" style={{color: '#ff9999'}}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>waving_hand</span>
                  早安心语
                </h3>
                {result?.analysis?.greeting ? (
                  <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                    {result.analysis.greeting}
                  </Streamdown>
                ) : (
                  <CardLoadingIndicator />
                )}
              </div>
            </div>

            {/* 穿搭灵感 - 跨越2列 */}
            <div 
              className="md:col-span-2" 
              style={{
                width: '100%', 
                maxWidth: '100%', 
                boxSizing: 'border-box',
                opacity: visibleElements.has('outfit-card') ? 1 : 0,
                transform: visibleElements.has('outfit-card') ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.6s ease-out, transform 0.6s ease-out'
              }}
            >
              <div className="card-interactive rounded-2xl border-l-4" style={{
                borderLeftColor: '#72a5ff',
                borderLeftWidth: '4px',
                borderLeftStyle: 'solid',
                backgroundColor: '#ffffff',
                background: '#ffffff',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                WebkitBoxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                padding: '12px 16px',
                paddingTop: '12px',
                paddingBottom: '12px',
                paddingLeft: '16px',
                paddingRight: '16px',
                marginBottom: '16px',
                marginTop: '0'
              }}>
                <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center" style={{color: '#72a5ff'}}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>checkroom</span>
                  穿搭灵感
                </h3>
                {result?.analysis?.outfit ? (
                  <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                    {result.analysis.outfit}
                  </Streamdown>
                ) : (
                  <CardLoadingIndicator />
                )}
              </div>
            </div>

            {/* 幸运配色 - 1列 */}
            <div 
              className="md:col-span-1" 
              style={{
                width: '100%', 
                maxWidth: '100%', 
                boxSizing: 'border-box',
                opacity: visibleElements.has('color-card') ? 1 : 0,
                transform: visibleElements.has('color-card') ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.6s ease-out, transform 0.6s ease-out'
              }}
            >
              <div className="card-interactive rounded-2xl border-l-4" style={{
                borderLeftColor: '#64dd17',
                borderLeftWidth: '4px',
                borderLeftStyle: 'solid',
                backgroundColor: '#ffffff',
                background: '#ffffff',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                WebkitBoxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                padding: '12px 16px',
                paddingTop: '12px',
                paddingBottom: '12px',
                paddingLeft: '16px',
                paddingRight: '16px',
                marginBottom: '16px',
                marginTop: '0'
              }}>
                <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center" style={{color: '#64dd17'}}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>palette</span>
                  幸运配色
                </h3>
                {result?.analysis?.color ? (
                  <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                    {result.analysis.color}
                  </Streamdown>
                ) : (
                  <CardLoadingIndicator />
                )}
              </div>
            </div>

            {/* 情绪流动 - 1列 */}
            <div 
              className="md:col-span-1" 
              style={{
                width: '100%', 
                maxWidth: '100%', 
                boxSizing: 'border-box',
                opacity: visibleElements.has('mood-card') ? 1 : 0,
                transform: visibleElements.has('mood-card') ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.6s ease-out, transform 0.6s ease-out'
              }}
            >
              <div className="card-interactive rounded-2xl border-l-4" style={{
                borderLeftColor: '#ffc107',
                borderLeftWidth: '4px',
                borderLeftStyle: 'solid',
                backgroundColor: '#ffffff',
                background: '#ffffff',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                WebkitBoxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                padding: '12px 16px',
                paddingTop: '12px',
                paddingBottom: '12px',
                paddingLeft: '16px',
                paddingRight: '16px',
                marginBottom: '16px',
                marginTop: '0'
              }}>
                <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center" style={{color: '#ffc107'}}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>sentiment_satisfied</span>
                  情绪流动
                </h3>
                {result?.analysis?.mood ? (
                  <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                    {result.analysis.mood}
                  </Streamdown>
                ) : (
                  <CardLoadingIndicator />
                )}
              </div>
            </div>

            {/* 工作指引 - 跨越2列 */}
            <div 
              className="md:col-span-2" 
              style={{
                width: '100%', 
                maxWidth: '100%', 
                boxSizing: 'border-box',
                opacity: visibleElements.has('career-card') ? 1 : 0,
                transform: visibleElements.has('career-card') ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.6s ease-out, transform 0.6s ease-out'
              }}
            >
              <div className="card-interactive rounded-2xl border-l-4" style={{
                borderLeftColor: '#4db6ac',
                borderLeftWidth: '4px',
                borderLeftStyle: 'solid',
                backgroundColor: '#ffffff',
                background: '#ffffff',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                WebkitBoxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                padding: '12px 16px',
                paddingTop: '12px',
                paddingBottom: '12px',
                paddingLeft: '16px',
                paddingRight: '16px',
                marginBottom: '16px',
                marginTop: '0'
              }}>
                <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center" style={{color: '#4db6ac'}}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>work</span>
                  工作指引
                </h3>
                {result?.analysis?.career ? (
                  <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                    {result.analysis.career}
                  </Streamdown>
                ) : (
                  <CardLoadingIndicator />
                )}
              </div>
            </div>

            {/* 情感气场 - 跨越2列 */}
            <div 
              className="md:col-span-2" 
              style={{
                width: '100%', 
                maxWidth: '100%', 
                boxSizing: 'border-box',
                opacity: visibleElements.has('love-card') ? 1 : 0,
                transform: visibleElements.has('love-card') ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.6s ease-out, transform 0.6s ease-out'
              }}
            >
              <div className="card-interactive rounded-2xl border-l-4" style={{
                borderLeftColor: '#f48fb1',
                borderLeftWidth: '4px',
                borderLeftStyle: 'solid',
                backgroundColor: '#ffffff',
                background: '#ffffff',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                WebkitBoxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                padding: '12px 16px',
                paddingTop: '12px',
                paddingBottom: '12px',
                paddingLeft: '16px',
                paddingRight: '16px',
                marginBottom: '16px',
                marginTop: '0'
              }}>
                <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center" style={{color: '#f48fb1'}}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>favorite</span>
                  情感气场
                </h3>
                {result?.analysis?.love ? (
                  <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                    {result.analysis.love}
                  </Streamdown>
                ) : (
                  <CardLoadingIndicator />
                )}
              </div>
            </div>

            {/* 幸运微光 - 1列 */}
            <div 
              className="md:col-span-1" 
              style={{
                width: '100%', 
                maxWidth: '100%', 
                boxSizing: 'border-box',
                opacity: visibleElements.has('luck-card') ? 1 : 0,
                transform: visibleElements.has('luck-card') ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.6s ease-out, transform 0.6s ease-out'
              }}
            >
              <div className="card-interactive rounded-2xl border-l-4" style={{
                borderLeftColor: '#9c27b0',
                borderLeftWidth: '4px',
                borderLeftStyle: 'solid',
                backgroundColor: '#ffffff',
                background: '#ffffff',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                WebkitBoxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                padding: '12px 16px',
                paddingTop: '12px',
                paddingBottom: '12px',
                paddingLeft: '16px',
                paddingRight: '16px',
                marginBottom: '16px',
                marginTop: '0'
              }}>
                <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center" style={{color: '#9c27b0'}}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>star</span>
                  幸运微光
                </h3>
                {result?.analysis?.luck ? (
                  <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                    {result.analysis.luck}
                  </Streamdown>
                ) : (
                  <CardLoadingIndicator />
                )}
              </div>
            </div>
          </div>


        </div>
      </div>
    );

  // 错误状态
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{
        background: '#fff7ed',
        backgroundImage: '-webkit-linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%), -moz-linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%), -o-linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%), linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%)',
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'scroll'
      }}>
        <div className="text-center p-6">
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }

  return null;
}

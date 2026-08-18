import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import UniversalBackground from "@/components/UniversalBackground";
import Seo from "@/components/seo/Seo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { FileText, Plus, Upload, Download, Search, Filter, Link, Calendar, User, Trash2, Eye, ExternalLink } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getDocuments, addDocument, deleteDocument as dbDeleteDocument, updateDocumentLinks } from "@/lib/db";
import { useApp } from "@/contexts/AppContext";
import { toast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/common/ConfirmDialog";
import { useSearchParams } from "react-router-dom";
import { InventoryItem } from "@/components/inventory/InventoryTable";
import { ItemLink } from "@/components/common/ItemLink";

// Empty arrays for clean start
const mockComponents: any[] = [];
const mockDocuments: any[] = [];

const formSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  description: z.string().optional(),
  category: z.string().min(1, "Категория обязательна"),
  // component selection управляется отдельно (множественный выбор)
  tags: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

type ComponentOption = { id: number; name: string; category: string };

const Documents = () => {
  // Hooks must be called at the top level
  const context = useApp();
  const items: InventoryItem[] = context?.items || [];
  const refreshItems = context?.refreshItems;
  
  const { confirm, dialog } = useConfirm();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [componentFilter, setComponentFilter] = useState<string>("all");
  const [documents, setDocuments] = useState(mockDocuments);
  
  // Use items from context
  const components: ComponentOption[] = useMemo(() => {
    if (!Array.isArray(items)) {
      return [];
    }
    return items.map(item => ({ id: item.id, name: item.name, category: item.category }));
  }, [items]);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<typeof mockDocuments[0] | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedComponentIds, setSelectedComponentIds] = useState<number[]>([]);
  const [editLinksDoc, setEditLinksDoc] = useState<any | null>(null);
  const [editSelectedComponentIds, setEditSelectedComponentIds] = useState<number[]>([]);
  const [componentSearch, setComponentSearch] = useState("");
  const [editComponentSearch, setEditComponentSearch] = useState("");

  const filteredComponents = useMemo(() => {
    const q = componentSearch.toLowerCase().trim();
    if (!q) return components;
    return components.filter(c => (c.name + " " + c.category).toLowerCase().includes(q));
  }, [components, componentSearch]);

  const editFilteredComponents = useMemo(() => {
    const q = editComponentSearch.toLowerCase().trim();
    if (!q) return components;
    return components.filter(c => (c.name + " " + c.category).toLowerCase().includes(q));
  }, [components, editComponentSearch]);

  // Helpers
  const getMimeFromExtension = (ext: string) => {
    const e = ext.toLowerCase();
    if (e === 'pdf') return 'application/pdf';
    if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
    if (e === 'png') return 'image/png';
    if (e === 'txt') return 'text/plain;charset=utf-8';
    if (e === 'doc') return 'application/msword';
    if (e === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (e === 'xls') return 'application/vnd.ms-excel';
    if (e === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return 'application/octet-stream';
  };

  const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = (reader.result as string) || '';
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Auto-filter by itemId from URL
  useEffect(() => {
    const itemIdParam = searchParams.get('itemId');
    if (itemIdParam) {
      setComponentFilter(itemIdParam);
    }
  }, [searchParams]);

  // Load documents from DB
  useEffect(() => {
    let isMounted = true;
    
    const loadDocs = async () => {
      try {
        const rows: any[] = await getDocuments();
        if (!isMounted) return;
        
        if (!Array.isArray(rows)) {
          console.warn('⚠️ getDocuments returned non-array:', rows);
          if (isMounted) setDocuments([]);
          return;
        }
        
        const mapped = rows.map((r: any) => {
          try {
            const ext = (r.type || '').toString();
            const mime = getMimeFromExtension(ext);
            const dataUrl = `data:${mime};base64,${r.dataBase64 || ''}`;
            const componentIds: number[] = typeof r.componentIds === 'string' && r.componentIds
              ? r.componentIds.split(',').map((id: string) => Number(id)).filter(Boolean)
              : (r.legacyComponentId ? [Number(r.legacyComponentId)] : []);
            const compNames = componentIds
              .map((id) => {
                const item = Array.isArray(items) ? items.find((c) => c.id === id) : null;
                return item?.name;
              })
              .filter(Boolean)
              .join(', ');
            return {
              id: r.id,
              name: r.name || 'Без названия',
              type: ext,
              size: `${(Number(r.sizeBytes || 0) / (1024 * 1024)).toFixed(1)} MB`,
              componentIds,
              componentNames: compNames,
              category: r.category || 'Без категории',
              uploadedBy: r.uploadedBy || 'Пользователь',
              uploadedAt: (r.uploadedAt || '').toString().split('T')[0],
              description: r.description || '',
              tags: typeof r.tags === 'string' ? r.tags.split(',').filter(Boolean) : (r.tags || []),
              url: dataUrl,
            };
          } catch (itemError) {
            console.error('❌ Error processing document item:', itemError, r);
            return null;
          }
        }).filter(Boolean) as any[];
        
        if (isMounted) {
          setDocuments(mapped);
        }
      } catch (error) {
        console.error('❌ Error loading documents:', error);
        if (isMounted) {
          setDocuments([]);
        }
      }
    };

    // Only load if items are available (or if items array is empty, still try to load)
    loadDocs();

    const onDocsUpdated = () => {
      if (isMounted) {
        loadDocs();
      }
    };
    
    window.addEventListener('documentsUpdated', onDocsUpdated as any);
    return () => {
      isMounted = false;
      window.removeEventListener('documentsUpdated', onDocsUpdated as any);
    };
  }, [items]);

  const categories = useMemo(() => Array.from(new Set(documents.map(doc => doc.category))), [documents]);
  const componentCategories = useMemo(() => Array.from(new Set(components.map(comp => comp.category))), [components]);

  const filteredDocuments = useMemo(() => {
    if (!Array.isArray(documents)) {
      return [];
    }
    try {
      return documents.filter(doc => {
        if (!doc) return false;
        const matchSearch = (doc.name || '').toLowerCase().includes(search.toLowerCase()) ||
                           (doc.description || '').toLowerCase().includes(search.toLowerCase()) ||
                           (Array.isArray(doc.tags) ? doc.tags : []).some((tag: string) => tag.toLowerCase().includes(search.toLowerCase()));
        const matchCategory = categoryFilter === "all" || doc.category === categoryFilter;
        const matchComponent = componentFilter === "all" || 
          (Array.isArray(doc.componentIds) ? doc.componentIds : []).some((id: number) => id.toString() === componentFilter) ||
          (doc.componentNames || '').toLowerCase().includes(componentFilter.toLowerCase());
        return matchSearch && matchCategory && matchComponent;
      });
    } catch (error) {
      console.error('❌ Error filtering documents:', error);
      return [];
    }
  }, [documents, search, categoryFilter, componentFilter]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      tags: "",
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUploadDocument = async (data: FormData) => {
    if (!selectedFile) return;
    if (!selectedComponentIds.length) {
      toast({ title: "Не выбрано изделие", description: "Документ привязывается хотя бы к одному изделию", variant: "destructive" });
      return;
    }
    try {
      const ext = selectedFile.name.split('.').pop() || 'unknown';
      const base64 = await fileToBase64(selectedFile);
      await addDocument({
        name: data.name,
        type: ext,
        sizeBytes: selectedFile.size,
        componentIds: selectedComponentIds,
        category: data.category,
        description: data.description || '',
        tags: data.tags ? data.tags.split(',').map(t => t.trim()) : [],
        uploadedBy: 'Текущий пользователь',
        dataBase64: base64,
      });
      
      // Reload list
      const rows: any[] = await getDocuments();
      if (Array.isArray(rows)) {
        const mapped = rows.map((r: any) => {
          const componentIds: number[] = typeof r.componentIds === 'string' && r.componentIds 
            ? r.componentIds.split(',').map((id: string) => Number(id)).filter(Boolean) 
            : [];
          const compNames = componentIds
            .map((id) => {
              const comp = Array.isArray(items) ? items.find(c => c.id === Number(id)) : null;
              return comp?.name;
            })
            .filter(Boolean)
            .join(', ');
          return {
            id: r.id,
            name: r.name || 'Без названия',
            type: r.type,
            size: `${(Number(r.sizeBytes || 0) / (1024 * 1024)).toFixed(1)} MB`,
            componentIds,
            componentNames: compNames,
            category: r.category || 'Без категории',
            uploadedBy: r.uploadedBy || 'Пользователь',
            uploadedAt: (r.uploadedAt || '').toString().split('T')[0],
            description: r.description || '',
            tags: typeof r.tags === 'string' ? r.tags.split(',').filter(Boolean) : (r.tags || []),
            url: `data:${getMimeFromExtension(r.type)};base64,${r.dataBase64 || ''}`,
          };
        });
        setDocuments(mapped);
      }
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('documentsUpdated'));
      
      setIsUploadDialogOpen(false);
      setSelectedFile(null);
      setSelectedComponentIds([]);
      form.reset();
    } catch (error) {
      console.error('❌ Error uploading document:', error);
      toast({ title: "Не удалось загрузить документ", description: "Попробуйте ещё раз", variant: "destructive" });
    }
  };

  const handleDeleteDocument = async (id: number) => {
    const ok = await confirm({
      title: "Удалить документ?",
      description: "Файл будет удалён с диска, если на него не ссылаются другие записи.",
      confirmLabel: "Удалить",
      destructive: true,
    });
    if (!ok) return;
    await dbDeleteDocument(id);
    setDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  const handleViewDocument = (document: typeof mockDocuments[0]) => {
    setSelectedDocument(document);
    setIsViewDialogOpen(true);
  };

  const handleDownloadDocument = (doc: typeof mockDocuments[0]) => {
    const link = document.createElement('a');
    link.href = doc.url;
    link.download = doc.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getFileIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'pdf':
        return '📄';
      case 'jpg':
      case 'jpeg':
      case 'png':
        return '🖼️';
      case 'doc':
      case 'docx':
        return '📝';
      case 'xls':
      case 'xlsx':
        return '📊';
      case 'txt':
        return '📄';
      default:
        return '📎';
    }
  };

  const canPreview = (type: string) => {
    return ['pdf', 'jpg', 'jpeg', 'png', 'txt'].includes(type.toLowerCase());
  };

  const summary = { 
    name: "Документы", 
    quantity: Array.isArray(filteredDocuments) ? filteredDocuments.length : 0, 
    location: "База данных", 
    category: "Файлы" 
  };

  // Early return if context is not available (shouldn't happen, but just in case)
  if (!context) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <Seo 
        title="Документы склада — управление файлами"
        description="Поиск и управление документами склада. Прикрепление файлов к компонентам."
        canonical="/documents"
      />

      <div className="absolute inset-0 -z-10">
        <UniversalBackground />
      </div>

      <div className="grid grid-cols-[auto_1fr]">
        <Sidebar />
        <div className="min-h-screen flex flex-col">
          <TopBar search={search} onSearch={setSearch} summary={summary} />
          
          <main className="container mx-auto px-4 py-6 space-y-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <h1 className="text-3xl font-bold">Документы</h1>
                  <p className="text-muted-foreground">Управление документами и файлами склада</p>
                </div>
              </div>
              <Button onClick={() => setIsUploadDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Загрузить документ
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Фильтры</CardTitle>
                <CardDescription>Настройте фильтры для поиска документов</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="category-filter">Категория документа</Label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все категории</SelectItem>
                        {categories.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="component-filter">Компонент</Label>
                    <Select value={componentFilter} onValueChange={setComponentFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все компоненты</SelectItem>
                        {components.map(comp => (
                          <SelectItem key={comp.id} value={comp.name}>{comp.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => {
                        setCategoryFilter("all");
                        setComponentFilter("all");
                        setSearch("");
                      }}
                    >
                      <Filter className="h-4 w-4 mr-2" />
                      Сбросить фильтры
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Документы склада</CardTitle>
                <CardDescription>Найдено документов: {filteredDocuments.length}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Документ</TableHead>
                      <TableHead>Компонент</TableHead>
                      <TableHead>Категория</TableHead>
                      <TableHead>Размер</TableHead>
                      <TableHead>Загружен</TableHead>
                      <TableHead>Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.map(doc => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{getFileIcon(doc.type)}</span>
                            <div>
                              <div className="font-medium">{doc.name}</div>
                              {doc.description && (
                                <div className="text-sm text-muted-foreground">{doc.description}</div>
                              )}
                              <div className="flex gap-1 mt-1">
                                {doc.tags.map((tag: string) => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                      <div className="space-y-1">
                        {doc.componentIds && doc.componentIds.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {doc.componentIds.slice(0, 2).map((id: number) => (
                              <ItemLink key={id} itemId={id} variant="outline" size="sm" />
                            ))}
                            {doc.componentIds.length > 2 && (
                              <span className="text-xs text-muted-foreground">+{doc.componentIds.length - 2}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Не привязан</span>
                        )}
                      </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{doc.category}</Badge>
                        </TableCell>
                        <TableCell>{doc.size}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{doc.uploadedAt}</div>
                            <div className="text-muted-foreground">{doc.uploadedBy}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {canPreview(doc.type) && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleViewDocument(doc)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleDownloadDocument(doc)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setEditLinksDoc(doc); setEditSelectedComponentIds(doc.componentIds || []); }}
                            >
                              <Link className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteDocument(doc.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>

      {/* Диалог просмотра документа */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedDocument && getFileIcon(selectedDocument.type)}
              {selectedDocument?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedDocument?.description}
            </DialogDescription>
          </DialogHeader>
          
          {selectedDocument && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Компоненты:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedDocument.componentIds && selectedDocument.componentIds.length > 0 ? (
                      selectedDocument.componentIds.map((id: number) => (
                        <ItemLink key={id} itemId={id} variant="outline" size="sm" />
                      ))
                    ) : (
                      <span className="text-muted-foreground">Не привязан</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="font-medium">Категория:</span> {selectedDocument.category}
                </div>
                <div>
                  <span className="font-medium">Размер:</span> {selectedDocument.size}
                </div>
                <div>
                  <span className="font-medium">Загружен:</span> {selectedDocument.uploadedAt}
                </div>
                <div>
                  <span className="font-medium">Автор:</span> {selectedDocument.uploadedBy}
                </div>
                <div>
                  <span className="font-medium">Тип файла:</span> {selectedDocument.type.toUpperCase()}
                </div>
              </div>

              <div>
                <span className="font-medium">Теги:</span>
                <div className="flex gap-1 mt-1">
                  {selectedDocument.tags.map((tag: string) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="font-medium">Предварительный просмотр</h4>
                <div className="border rounded-lg p-4 bg-muted/50 min-h-[300px] flex items-center justify-center">
                  {selectedDocument.type.toLowerCase() === 'pdf' ? (
                    <div className="text-center">
                      <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">PDF документ</p>
                      <p className="text-sm text-muted-foreground">Для просмотра нажмите "Скачать"</p>
                    </div>
                  ) : selectedDocument.type.toLowerCase() === 'txt' ? (
                    <div className="text-center w-full">
                      <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Текстовый документ</p>
                      <p className="text-sm text-muted-foreground">Для просмотра нажмите "Скачать"</p>
                    </div>
                  ) : selectedDocument.type.toLowerCase().match(/jpg|jpeg|png/) ? (
                    <div className="text-center">
                      <img 
                        src={selectedDocument.url} 
                        alt={selectedDocument.name}
                        className="max-w-full max-h-64 object-contain rounded"
                      />
                    </div>
                  ) : (
                    <div className="text-center">
                      <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Предварительный просмотр недоступен</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsViewDialogOpen(false)}
                >
                  Закрыть
                </Button>
                <Button
                  onClick={() => {
                    handleDownloadDocument(selectedDocument);
                    setIsViewDialogOpen(false);
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Скачать
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Диалог загрузки документа */}
      <Dialog open={isUploadDialogOpen} onOpenChange={(open)=>{ setIsUploadDialogOpen(open); if(!open){ setSelectedFile(null); setSelectedComponentIds([]); }}}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Загрузить документ</DialogTitle>
            <DialogDescription>
              Прикрепите документ к одному или нескольким компонентам склада
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={form.handleSubmit(handleUploadDocument)} className="space-y-4">
            <div>
              <Label htmlFor="file">Выберите файл *</Label>
              <Input
                id="file"
                type="file"
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt"
                className="mt-1"
              />
              {selectedFile && (
                <div className="mt-2 p-2 bg-muted rounded text-sm">
                  Выбран файл: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Название документа *</Label>
                <Input
                  id="name"
                  {...form.register("name")}
                  placeholder="Техническая документация"
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="category">Категория *</Label>
                <Select value={form.watch("category")} onValueChange={(value) => form.setValue("category", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите категорию" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Техническая документация">Техническая документация</SelectItem>
                    <SelectItem value="Инструкция">Инструкция</SelectItem>
                    <SelectItem value="Сертификат">Сертификат</SelectItem>
                    <SelectItem value="Схема">Схема</SelectItem>
                    <SelectItem value="Другое">Другое</SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.category && (
                  <p className="text-sm text-destructive">{form.formState.errors.category.message}</p>
                )}
              </div>
            </div>

            <div>
              <Label>Прикрепить к изделиям *</Label>
              <Input
                placeholder="Поиск по названию или категории"
                className="mb-2"
                onChange={(e)=> setComponentSearch(e.target.value)}
              />
              <div className="grid sm:grid-cols-2 gap-2 max-h-56 overflow-auto p-2 rounded-md border">
                {filteredComponents.map((comp) => {
                  const checked = selectedComponentIds.includes(comp.id);
                  return (
                    <label key={comp.id} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e)=>{
                          setSelectedComponentIds(prev=> e.target.checked ? Array.from(new Set([...prev, comp.id])) : prev.filter(id=>id!==comp.id));
                        }}
                      />
                      <span className="truncate">{comp.name} ({comp.category})</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                {...form.register("description")}
                placeholder="Краткое описание документа"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="tags">Теги (через запятую)</Label>
              <Input
                id="tags"
                {...form.register("tags")}
                placeholder="техдокументация, инструкция, схема"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsUploadDialogOpen(false);
                  setSelectedFile(null);
                  form.reset();
                }}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={!selectedFile}>
                <Upload className="h-4 w-4 mr-2" />
                Загрузить документ
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Диалог редактирования привязок */}
      <Dialog open={!!editLinksDoc} onOpenChange={(open)=>{ if(!open){ setEditLinksDoc(null); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Изменить привязки документа</DialogTitle>
            <DialogDescription>
              Выберите изделия, к которым должен быть привязан документ
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Поиск по названию или категории"
            className="mb-2"
            onChange={(e)=> setEditComponentSearch(e.target.value)}
          />
          <div className="grid sm:grid-cols-2 gap-2 max-h-72 overflow-auto p-2 rounded-md border">
            {editFilteredComponents.map((comp) => {
              const checked = editSelectedComponentIds.includes(comp.id);
              return (
                <label key={comp.id} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e)=>{
                      setEditSelectedComponentIds(prev=> e.target.checked ? Array.from(new Set([...prev, comp.id])) : prev.filter(id=>id!==comp.id));
                    }}
                  />
                  <span className="truncate">{comp.name} ({comp.category})</span>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={()=> setEditLinksDoc(null)}>Отмена</Button>
            <Button onClick={async ()=>{
              if (!editLinksDoc) return;
              await updateDocumentLinks(editLinksDoc.id, editSelectedComponentIds);
              const rows: any[] = await getDocuments();
              const mapped = rows.map((r: any) => ({
                id: r.id,
                name: r.name,
                type: r.type,
                size: `${(Number(r.sizeBytes) / (1024 * 1024)).toFixed(1)} MB`,
                componentIds: typeof r.componentIds === 'string' && r.componentIds ? r.componentIds.split(',').map((id: string)=>Number(id)) : [],
                componentNames: (typeof r.componentIds === 'string' ? r.componentIds.split(',').map((id: string)=>{
                  const comp = items.find(c=>c.id===Number(id));
                  return comp?.name;
                }).filter(Boolean).join(', ') : ''),
                category: r.category,
                uploadedBy: r.uploadedBy || 'Пользователь',
                uploadedAt: (r.uploadedAt || '').toString().split('T')[0],
                description: r.description || '',
                tags: typeof r.tags === 'string' ? r.tags.split(',').filter(Boolean) : (r.tags || []),
                url: `data:${(r.type || '').toString()};base64,${r.dataBase64}`,
              }));
              setDocuments(mapped);
              setEditLinksDoc(null);
            }}>Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  );
};

export default Documents;

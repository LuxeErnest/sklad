import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import BackgroundGlow from "@/components/common/BackgroundGlow";
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
import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

// Mock data for documents
const mockComponents = [
  { id: 1, name: "SSD 1TB", category: "Накопители" },
  { id: 2, name: "DDR4 16GB", category: "Память" },
  { id: 3, name: "CPU Ryzen 7", category: "Процессоры" },
  { id: 4, name: "SATA кабель", category: "Кабели" },
  { id: 5, name: "Материнская плата", category: "Платы" },
];

const mockDocuments = [
  {
    id: 1,
    name: "Техническая документация SSD 1TB",
    type: "pdf",
    size: "2.5 MB",
    componentId: 1,
    componentName: "SSD 1TB",
    category: "Техническая документация",
    uploadedBy: "Иван Петров",
    uploadedAt: "2025-08-01",
    description: "Полная техническая документация для SSD накопителя",
    tags: ["техдокументация", "ssd", "накопители"],
    url: "https://example.com/docs/ssd-manual.pdf",
  },
  {
    id: 2,
    name: "Инструкция по установке DDR4",
    type: "pdf",
    size: "1.8 MB",
    componentId: 2,
    componentName: "DDR4 16GB",
    category: "Инструкция",
    uploadedBy: "Мария Сидорова",
    uploadedAt: "2025-08-03",
    description: "Пошаговая инструкция по установке оперативной памяти",
    tags: ["инструкция", "память", "установка"],
    url: "https://example.com/docs/ddr4-install.pdf",
  },
  {
    id: 3,
    name: "Сертификат качества CPU Ryzen 7",
    type: "pdf",
    size: "0.5 MB",
    componentId: 3,
    componentName: "CPU Ryzen 7",
    category: "Сертификат",
    uploadedBy: "Алексей Козлов",
    uploadedAt: "2025-08-05",
    description: "Сертификат качества и соответствия",
    tags: ["сертификат", "качество", "cpu"],
    url: "https://example.com/docs/ryzen-cert.pdf",
  },
  {
    id: 4,
    name: "Схема подключения SATA кабелей",
    type: "jpg",
    size: "3.2 MB",
    componentId: 4,
    componentName: "SATA кабель",
    category: "Схема",
    uploadedBy: "Елена Волкова",
    uploadedAt: "2025-08-07",
    description: "Визуальная схема подключения SATA кабелей",
    tags: ["схема", "подключение", "sata"],
    url: "https://example.com/docs/sata-diagram.jpg",
  },
];

const formSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  description: z.string().optional(),
  category: z.string().min(1, "Категория обязательна"),
  componentId: z.string().min(1, "Компонент обязателен"),
  tags: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const Documents = () => {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [componentFilter, setComponentFilter] = useState<string>("all");
  const [documents, setDocuments] = useState(mockDocuments);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<typeof mockDocuments[0] | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const categories = useMemo(() => Array.from(new Set(documents.map(doc => doc.category))), []);
  const componentCategories = useMemo(() => Array.from(new Set(mockComponents.map(comp => comp.category))), []);

  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      const matchSearch = doc.name.toLowerCase().includes(search.toLowerCase()) ||
                         doc.description?.toLowerCase().includes(search.toLowerCase()) ||
                         doc.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()));
      const matchCategory = categoryFilter === "all" || doc.category === categoryFilter;
      const matchComponent = componentFilter === "all" || doc.componentName.toLowerCase().includes(componentFilter.toLowerCase());
      return matchSearch && matchCategory && matchComponent;
    });
  }, [documents, search, categoryFilter, componentFilter]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      componentId: "",
      tags: "",
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUploadDocument = (data: FormData) => {
    if (!selectedFile) return;

    const newDocument = {
      id: Math.max(...documents.map(d => d.id), 0) + 1,
      name: data.name,
      type: selectedFile.name.split('.').pop() || "unknown",
      size: `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`,
      componentId: parseInt(data.componentId),
      componentName: mockComponents.find(c => c.id === parseInt(data.componentId))?.name || "",
      category: data.category,
      uploadedBy: "Текущий пользователь",
      uploadedAt: new Date().toISOString().split('T')[0],
      description: data.description || "",
      tags: data.tags ? data.tags.split(',').map(tag => tag.trim()) : [],
      url: URL.createObjectURL(selectedFile), // Create a blob URL for the uploaded file
    };

    setDocuments(prev => [...prev, newDocument]);
    setIsUploadDialogOpen(false);
    setSelectedFile(null);
    form.reset();
  };

  const handleDeleteDocument = (id: number) => {
    if (confirm("Вы уверены, что хотите удалить этот документ?")) {
      setDocuments(prev => prev.filter(doc => doc.id !== id));
    }
  };

  const handleViewDocument = (document: typeof mockDocuments[0]) => {
    setSelectedDocument(document);
    setIsViewDialogOpen(true);
  };

  const handleDownloadDocument = (document: typeof mockDocuments[0]) => {
    // Create a temporary link element to trigger download
    const link = document.createElement('a');
    link.href = document.url;
    link.download = document.name;
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
      default:
        return '📎';
    }
  };

  const canPreview = (type: string) => {
    return ['pdf', 'jpg', 'jpeg', 'png'].includes(type.toLowerCase());
  };

  const summary = { 
    name: "Документы", 
    quantity: filteredDocuments.length, 
    location: "База данных", 
    category: "Файлы" 
  };

  return (
    <div className="min-h-screen relative">
      <Seo 
        title="Документы склада — управление файлами"
        description="Поиск и управление документами склада. Прикрепление файлов к компонентам."
        canonical="/documents"
      />

      <div className="absolute inset-0 -z-10">
        <BackgroundGlow />
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
                        {mockComponents.map(comp => (
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
                                {doc.tags.map(tag => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{doc.componentName}</div>
                            <div className="text-sm text-muted-foreground">
                              {mockComponents.find(c => c.id === doc.componentId)?.category}
                            </div>
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
                  <span className="font-medium">Компонент:</span> {selectedDocument.componentName}
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
                  {selectedDocument.tags.map(tag => (
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
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Загрузить документ</DialogTitle>
            <DialogDescription>
              Прикрепите документ к компоненту склада
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={form.handleSubmit(handleUploadDocument)} className="space-y-4">
            <div>
              <Label htmlFor="file">Выберите файл *</Label>
              <Input
                id="file"
                type="file"
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
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
              <Label htmlFor="componentId">Прикрепить к компоненту *</Label>
              <Select value={form.watch("componentId")} onValueChange={(value) => form.setValue("componentId", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите компонент" />
                </SelectTrigger>
                <SelectContent>
                  {mockComponents.map(comp => (
                    <SelectItem key={comp.id} value={comp.id.toString()}>
                      {comp.name} ({comp.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.componentId && (
                <p className="text-sm text-destructive">{form.formState.errors.componentId.message}</p>
              )}
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
    </div>
  );
};

export default Documents;

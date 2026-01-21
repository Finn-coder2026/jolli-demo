E2B ?= e2b
CLI_DIR := ../tools/jolliagent
TOOLS_DIR := ../tools
DIST_SRC := $(CLI_DIR)/dist
DIST_DST := ./dist
TOOLS := code2docusaurus docusaurus2vercel docs2docusaurus code2openapi
TOOLS_DST := $(DIST_DST)/tools

.PHONY: build e2b-build clean prepare-dist prepare-tools check-e2b

prepare-dist:
	@if [ ! -d "$(DIST_SRC)" ]; then \
		echo "➡ Building CLI to produce dist/..."; \
		( cd $(CLI_DIR) && npm run -s build ) || { echo "❌ CLI build failed"; exit 1; }; \
	fi
	@rm -rf $(DIST_DST)
	@cp -r $(DIST_SRC) $(DIST_DST)

# Build and vendor tools into ./dist/tools/<name> with dist/ + node_modules/
prepare-tools:
	@echo "➡ Preparing tools: $(TOOLS)"
	@mkdir -p $(TOOLS_DST)
	@for t in $(TOOLS); do \
		TOOL_DIR="$(TOOLS_DIR)/$$t"; \
		echo "   • Ensuring deps for $$t"; \
		if [ ! -d "$$TOOL_DIR/node_modules" ]; then ( cd "$$TOOL_DIR" && npm ci -s ) || { echo "❌ npm ci failed in $$TOOL_DIR"; exit 1; }; fi; \
		echo "   • Building $$t"; \
		( cd "$$TOOL_DIR" && npm run -s build && npm run -s package ) || { echo "❌ $$t build failed"; exit 1; }; \
		rm -rf "$(TOOLS_DST)/$$t"; \
		mkdir -p "$(TOOLS_DST)/$$t"; \
		cp -r "$$TOOL_DIR/dist" "$(TOOLS_DST)/$$t/"; \
		cp "$$TOOL_DIR/package.json" "$(TOOLS_DST)/$$t/package.json"; \
		echo "   • (Skipping copy of node_modules; will install in image)"; \
	done

check-e2b:
	@command -v $(E2B) >/dev/null 2>&1 || { echo "❌ '$(E2B)' CLI not found. Install: https://docs.e2b.dev/cli"; exit 1; }

build: clean prepare-dist prepare-tools
	docker build -f e2b.Dockerfile -t jolli-e2b --platform linux/amd64 .

# Template name - change this to a unique name for your E2B account
E2B_TEMPLATE_NAME ?= jolli-sandbox-zf

e2b-build: clean prepare-dist prepare-tools check-e2b
	$(E2B) template build --name $(E2B_TEMPLATE_NAME) --dockerfile e2b.Dockerfile

clean:
	rm -rf $(DIST_DST)

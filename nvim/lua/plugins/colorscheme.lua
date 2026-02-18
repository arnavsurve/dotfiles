return {
	{
		dir = "/Users/asurve/dev/anysphere.nvim",
		lazy = true,
	},

	{
		"bergholmm/cursor-dark.nvim",
		lazy = false,
		priority = 1000,
		config = function()
			vim.cmd.colorscheme("cursor-dark")
		end,
	},

	{
		"EdenEast/nightfox.nvim",
		lazy = false,
		-- config = function()
		-- 	vim.cmd.colorscheme("carbonfox")
		-- end,
	},

	{
		"deparr/tairiki.nvim",
		lazy = true,
	},

	{
		"ellisonleao/gruvbox.nvim",
		lazy = true,
	},

	{
		"sainnhe/gruvbox-material",
		lazy = true,
		opts = ...,
		-- config = function()
		-- 	vim.cmd.colorscheme("gruvbox-material")
		-- 	vim.g.gruvbox_material_enable_italic = true
		-- end,
	},

	{
		"sainnhe/edge",
		lazy = true,
	},

	{
		"d00h/nvim-rusticated",
		lazy = true,
	},

	{
		"rose-pine/neovim",
		name = "rosepine",
		lazy = true,
	},

	{
		"savq/melange-nvim",
		lazy = true,
		priority = 1000,
	},

	{
		"rebelot/kanagawa.nvim",
		lazy = true,
	},

	{
		"bluz71/vim-moonfly-colors",
		name = "moonfly",
		lazy = true,
	},

	{
		"vague2k/vague.nvim",
		name = "vague",
		lazy = true,
	},

	{
		"rockyzhang24/arctic.nvim",
		branch = "v2",
		dependencies = { "rktjmp/lush.nvim" },
		lazy = true,
	},

	{
		"Mofiqul/vscode.nvim",
		lazy = false,
		-- config = function()
		-- 	vim.cmd.colorscheme("vscode")
		-- end,
	},

	{
		"folke/tokyonight.nvim",
		lazy = false,
	},
}

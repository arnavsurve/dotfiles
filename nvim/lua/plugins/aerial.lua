return {
	"stevearc/aerial.nvim",
	opts = {
		layout = {
			min_width = 60,
		},
		filter_kind = {
			"Class",
			"Constant",
			"Constructor",
			"Enum",
			"EnumMember",
			"Field",
			"Function",
			"Interface",
			"Method",
			"Module",
			"Property",
			"Struct",
			"TypeParameter",
			"Variable",
		},
	},
	dependencies = {
		"nvim-treesitter/nvim-treesitter",
		"nvim-tree/nvim-web-devicons",
	},
}
